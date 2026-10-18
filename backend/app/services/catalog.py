"""Работа с локальным каталогом фильмов."""
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models import Genre, Movie, UserMovie
from ..providers.base import MovieData


def get_or_create_genres(db: Session, names: list[str]) -> list[Genre]:
    genres = []
    for raw in dict.fromkeys(n.strip().lower() for n in names if n and n.strip()):
        genre = db.scalar(select(Genre).where(Genre.name == raw))
        if genre is None:
            genre = Genre(name=raw)
            db.add(genre)
            db.flush()
        genres.append(genre)
    return genres


def upsert_movie(db: Session, data: MovieData) -> Movie:
    """Сохраняет фильм из внешнего API в каталог или обновляет существующую запись."""
    movie = db.scalar(
        select(Movie).where(Movie.source == data.source, Movie.external_id == data.external_id)
    )
    if movie is None:
        movie = Movie(source=data.source, external_id=data.external_id)
        db.add(movie)

    for field in ("title", "original_title", "year", "runtime", "overview", "poster_url",
                  "country", "director", "imdb_id", "rating_imdb", "rating_kp", "rating_tmdb"):
        value = getattr(data, field)
        if value is not None:
            setattr(movie, field, value)

    if data.genres:
        movie.genres = get_or_create_genres(db, data.genres)
    db.commit()
    db.refresh(movie)
    return movie


def local_search(db: Session, query: str, limit: int = 12) -> list[Movie]:
    """Поиск в локальном каталоге по названию, оригинальному названию и режиссёру."""
    pattern = query.lower()
    stmt = (
        select(Movie)
        .where(or_(func.lower(Movie.title).contains(pattern),
                   func.lower(Movie.original_title).contains(pattern),
                   func.lower(Movie.director).contains(pattern)))
        .order_by(Movie.year.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))


def popularity_subquery():
    return (
        select(UserMovie.movie_id, func.count(UserMovie.id).label("cnt"),
               func.count(UserMovie.id).filter(UserMovie.status == "watched").label("watched"),
               func.count(UserMovie.rating).label("rated"),
               func.avg(UserMovie.rating).label("avg"))
        .group_by(UserMovie.movie_id)
        .subquery()
    )


def weighted_rating(pop, prior_votes: int = 3):
    """Взвешенная оценка для сортировки «Высшие оценки».

    Средняя оценка зрителей сервиса смешивается с рейтингом IMDb: пока голосов мало,
    решает IMDb, и фильм с одной «десяткой» не обгоняет признанную классику.
    """
    rated = func.coalesce(pop.c.rated, 0)
    prior = func.coalesce(Movie.rating_imdb, Movie.rating_kp, 7.0)
    return (rated * func.coalesce(pop.c.avg, 0) + prior_votes * prior) / (rated + prior_votes)
