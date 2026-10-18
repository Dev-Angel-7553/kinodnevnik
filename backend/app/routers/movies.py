"""Поиск фильмов во внешних API, импорт в каталог, карточка фильма."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_current_user_optional
from ..models import Genre, Movie, SearchHistory, User, UserMovie
from ..providers.base import ProviderError
from ..providers.hub import ProviderHub
from ..schemas import (
    CatalogItem, EntryShort, ImportIn, MovieDetailOut, MovieOut, ProviderStatus,
    ReviewOut, SearchItem, SearchOut,
)
from ..services import catalog

router = APIRouter(prefix="/api/movies", tags=["Фильмы"])


def get_hub(db: Session = Depends(get_db)):
    hub = ProviderHub(db)
    try:
        yield hub
    finally:
        hub.close()


@router.get("/providers", response_model=list[ProviderStatus])
def providers(hub: ProviderHub = Depends(get_hub)):
    """Какие внешние API подключены (есть ли ключ)."""
    return hub.status()


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    """Сводные числа для главной страницы."""
    count = lambda stmt: db.scalar(stmt) or 0  # noqa: E731
    return {
        "movies": count(select(func.count(Movie.id))),
        "users": count(select(func.count(User.id))),
        "ratings": count(select(func.count(UserMovie.id)).where(UserMovie.rating.is_not(None))),
        "reviews": count(select(func.count(UserMovie.id)).where(UserMovie.review.is_not(None),
                                                                UserMovie.review != "")),
    }


@router.get("/genres", response_model=list[str])
def genres(db: Session = Depends(get_db)):
    return list(db.scalars(select(Genre.name).order_by(Genre.name)))


@router.get("/search", response_model=SearchOut)
def search(
    q: str = Query(min_length=2, max_length=100, description="Название фильма"),
    provider: str | None = Query(default=None, description="tmdb | poiskkino | omdb | wikipedia | itunes"),
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
    hub: ProviderHub = Depends(get_hub),
):
    """Ищет фильм в локальном каталоге и во внешнем API, объединяя результаты."""
    query = q.strip()
    local = catalog.local_search(db, query)
    external, used, warnings = hub.search(query, provider)

    items = [
        SearchItem(source=m.source, external_id=m.external_id, title=m.title,
                   original_title=m.original_title, year=m.year, poster_url=m.poster_url,
                   overview=m.overview, local_id=m.id, imdb_id=m.imdb_id)
        for m in local
    ]
    seen = {(m.source, m.external_id) for m in local} | {(m.title.lower(), m.year) for m in local}
    for found in external:
        if (found.source, found.external_id) in seen or (found.title.lower(), found.year) in seen:
            continue
        seen.add((found.source, found.external_id))
        local_id = db.scalar(select(Movie.id).where(Movie.source == found.source,
                                                    Movie.external_id == found.external_id))
        items.append(SearchItem(local_id=local_id, **{
            k: getattr(found, k) for k in ("source", "external_id", "title", "original_title",
                                           "year", "poster_url", "overview", "imdb_id")}))

    if user:
        ids = [i.local_id for i in items if i.local_id]
        statuses = dict(db.execute(
            select(UserMovie.movie_id, UserMovie.status)
            .where(UserMovie.user_id == user.id, UserMovie.movie_id.in_(ids))
        ).all()) if ids else {}
        for item in items:
            item.my_status = statuses.get(item.local_id)
        # Повторный запрос не дублирует строку истории, а поднимает её наверх
        record = db.scalar(select(SearchHistory).where(
            SearchHistory.user_id == user.id, func.lower(SearchHistory.query) == query.lower()))
        if record is None:
            record = SearchHistory(user_id=user.id, query=query)
            db.add(record)
        record.provider = used or "local"
        record.results_count = len(items)
        record.searched_at = func.now()
        db.commit()

    if not external and not warnings and not hub.available():
        warnings.append("Внешние API не подключены — поиск выполнен по локальному каталогу")
    return SearchOut(query=query, provider=used, items=items, warnings=warnings)


@router.get("/catalog", response_model=list[CatalogItem])
def catalog_list(
    genre: str | None = None,
    sort: Literal["popular", "rating", "year", "title", "new"] = "popular",
    limit: int = Query(default=24, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Фильмы локального каталога с фильтром по жанру и сортировкой."""
    pop = catalog.popularity_subquery()
    stmt = select(Movie, pop.c.watched, pop.c.avg, pop.c.rated).outerjoin(pop, pop.c.movie_id == Movie.id)
    if genre:
        stmt = stmt.where(Movie.genres.any(Genre.name == genre.lower()))
    order = {
        "popular": (func.coalesce(pop.c.cnt, 0).desc(), Movie.rating_imdb.desc()),
        "rating": (catalog.weighted_rating(pop).desc(),),
        "year": (Movie.year.desc(),),
        "title": (Movie.title.asc(),),
        "new": (Movie.created_at.desc(), Movie.id.desc()),
    }[sort]
    items = []
    for movie, watched, avg, rated in db.execute(stmt.order_by(*order).limit(limit).offset(offset)):
        item = CatalogItem.model_validate(movie)
        item.community_rating = round(avg, 1) if avg else None
        item.votes = rated or 0
        item.watchers = watched or 0
        items.append(item)
    return items


@router.post("/import", response_model=MovieOut, status_code=status.HTTP_201_CREATED)
def import_movie(
    data: ImportIn,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    hub: ProviderHub = Depends(get_hub),
):
    """Загружает полную карточку фильма из API и сохраняет её в каталог."""
    existing = db.scalar(select(Movie).where(Movie.source == data.source,
                                             Movie.external_id == data.external_id))
    if existing:
        return existing
    try:
        details = hub.details(data.source, data.external_id)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return catalog.upsert_movie(db, details)


@router.get("/{movie_id}", response_model=MovieDetailOut)
def movie_detail(
    movie_id: int,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Фильм не найден")

    avg, watchers = db.execute(
        select(func.avg(UserMovie.rating), func.count(UserMovie.id))
        .where(UserMovie.movie_id == movie_id, UserMovie.status == "watched")
    ).one()
    result = MovieDetailOut.model_validate(movie)
    result.community_rating = round(avg, 1) if avg else None
    result.watchers = watchers
    if user:
        entry = db.scalar(select(UserMovie).where(UserMovie.user_id == user.id,
                                                  UserMovie.movie_id == movie_id))
        result.my_entry = EntryShort.model_validate(entry) if entry else None
    return result


@router.get("/{movie_id}/reviews", response_model=list[ReviewOut])
def movie_reviews(movie_id: int, db: Session = Depends(get_db)):
    """Отзывы пользователей о фильме — последние 20."""
    rows = db.execute(
        select(UserMovie, User)
        .join(User, User.id == UserMovie.user_id)
        .where(UserMovie.movie_id == movie_id, UserMovie.review.is_not(None), UserMovie.review != "")
        .order_by(UserMovie.updated_at.desc())
        .limit(20)
    ).all()
    return [
        ReviewOut(user_name=f"{u.first_name} {u.last_name[0]}.", login=u.login,
                  avatar_color=u.avatar_color, avatar_url=u.avatar_url, rating=e.rating, review=e.review,
                  watched_at=e.watched_at)
        for e, u in rows
    ]
