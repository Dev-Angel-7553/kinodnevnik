"""Дневник просмотров: фильмы пользователя, оценки, рецензии."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Genre, Movie, User, UserMovie
from ..schemas import EntryIn, EntryOut, EntryUpdate, Status

router = APIRouter(prefix="/api/library", tags=["Дневник просмотров"])


def get_own_entry(entry_id: int, user: User, db: Session) -> UserMovie:
    entry = db.get(UserMovie, entry_id)
    # Чужая запись выглядит для пользователя так же, как несуществующая
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Запись не найдена")
    return entry


def normalize(entry: UserMovie) -> None:
    """Бизнес-правила статусов: у фильма из «Буду смотреть» нет оценки и даты просмотра."""
    if entry.status == "planned":
        entry.rating = None
        entry.watched_at = None
    elif entry.status == "watched" and entry.watched_at is None:
        entry.watched_at = date.today()


@router.get("", response_model=list[EntryOut])
def list_entries(
    status_: Status | None = Query(default=None, alias="status"),
    genre: str | None = None,
    q: str | None = None,
    favorite: bool | None = None,
    sort: Literal["recent", "watched", "rating", "title", "year"] = "recent",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(UserMovie).join(Movie).where(UserMovie.user_id == user.id)
    if status_:
        stmt = stmt.where(UserMovie.status == status_)
    if favorite is not None:
        stmt = stmt.where(UserMovie.is_favorite == favorite)
    if genre:
        stmt = stmt.where(Movie.genres.any(Genre.name == genre.lower()))
    if q:
        stmt = stmt.where(func.lower(Movie.title).contains(q.lower().strip()))
    order = {
        "recent": (UserMovie.updated_at.desc(), UserMovie.id.desc()),
        "watched": (UserMovie.watched_at.desc().nulls_last(), UserMovie.id.desc()),
        "rating": (UserMovie.rating.desc().nulls_last(), UserMovie.watched_at.desc()),
        "title": (Movie.title.asc(),),
        "year": (Movie.year.desc(),),
    }[sort]
    return list(db.scalars(stmt.order_by(*order)).unique())


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def add_entry(data: EntryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Добавляет фильм в дневник. Если фильм уже есть — обновляет запись."""
    if db.get(Movie, data.movie_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Фильм не найден в каталоге")
    entry = db.scalar(select(UserMovie).where(UserMovie.user_id == user.id,
                                              UserMovie.movie_id == data.movie_id))
    if entry is None:
        entry = UserMovie(user_id=user.id, movie_id=data.movie_id)
        db.add(entry)
    for field, value in data.model_dump(exclude={"movie_id"}).items():
        setattr(entry, field, value)
    normalize(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=EntryOut)
def update_entry(entry_id: int, data: EntryUpdate,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = get_own_entry(entry_id, user, db)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("watched_at") and changes["watched_at"] > date.today():
        raise HTTPException(422,
                            detail="Дата просмотра не может быть в будущем")
    for field, value in changes.items():
        setattr(entry, field, value)
    normalize(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_own_entry(entry_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
