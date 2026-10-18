"""Выдача постеров внешних кинобаз через кэш сервера."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Movie
from ..services import posters

WEEK = {"Cache-Control": "public, max-age=604800"}

router = APIRouter(prefix="/api/posters", tags=["Фильмы"])


@router.get("", summary="Постер фильма из кэша сервера",
            responses={200: {"content": {"image/jpeg": {}}}, 404: {"description": "Постер недоступен"}})
def poster(url: str = Query(min_length=10, max_length=1000, description="Адрес постера во внешней кинобазе")):
    if not posters.is_allowed(url):
        raise HTTPException(404, "Адрес не относится к поддерживаемым кинобазам")
    file = posters.fetch(url)
    if file is None:
        raise HTTPException(404, "Не удалось загрузить постер")
    # Картинка по одному адресу не меняется — браузер может хранить её неделю
    return FileResponse(file, headers=WEEK)


@router.get("/movie/{movie_id}", summary="Постер фильма из каталога",
            responses={200: {"content": {"image/jpeg": {}}}, 404: {"description": "Постер не найден"}})
def movie_poster(movie_id: int, db: Session = Depends(get_db)):
    """Отдаёт постер фильма. Если основной адрес недоступен, сервер ищет постер этого фильма
    в других кинобазах (по IMDb ID, в Википедии и iTunes) и запоминает найденный."""
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(404, "Фильм не найден")
    file = posters.for_movie(db, movie)
    if file is None:
        raise HTTPException(404, "Постер не найден ни в одной кинобазе")
    return FileResponse(file, headers={"Cache-Control": "public, max-age=86400"})
