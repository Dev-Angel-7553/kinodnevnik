"""Общая часть провайдеров внешних API фильмов."""
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import ApiCache

log = logging.getLogger("kinodnevnik.providers")

# Перевод названий жанров англоязычных API (OMDb, iTunes) на русский
GENRES_RU = {
    "action": "боевик", "adventure": "приключения", "animation": "анимация",
    "biography": "биография", "comedy": "комедия", "crime": "криминал",
    "documentary": "документальный", "drama": "драма", "family": "семейный",
    "fantasy": "фэнтези", "history": "история", "horror": "ужасы",
    "music": "музыка", "musical": "мюзикл", "musicals": "мюзикл",
    "mystery": "детектив", "romance": "мелодрама", "sci-fi": "фантастика",
    "science fiction": "фантастика", "sci-fi & fantasy": "фантастика",
    "sport": "спорт", "sports": "спорт", "thriller": "триллер", "war": "военный",
    "western": "вестерн", "kids & family": "семейный", "independent": "независимое кино",
    "action & adventure": "боевик",
}


def genre_ru(name: str) -> str:
    return GENRES_RU.get(name.strip().lower(), name.strip().lower())


@dataclass
class MovieData:
    """Унифицированное описание фильма, независимое от источника."""
    source: str
    external_id: str
    title: str
    original_title: str | None = None
    year: int | None = None
    runtime: int | None = None
    overview: str | None = None
    poster_url: str | None = None
    country: str | None = None
    director: str | None = None
    genres: list[str] = field(default_factory=list)
    imdb_id: str | None = None
    rating_imdb: float | None = None
    rating_kp: float | None = None
    rating_tmdb: float | None = None


class ProviderError(Exception):
    """Ошибка внешнего API: сеть, таймаут, лимит запросов, неверный ключ."""


class BaseProvider:
    name = "base"
    title = "Базовый провайдер"
    requires_key = True
    free_limit = ""

    def __init__(self, db: Session, client: httpx.Client):
        self.db = db
        self.client = client

    def is_configured(self) -> bool:
        return not self.requires_key

    # --- методы, которые реализуют наследники ---
    def search(self, query: str, limit: int = 12) -> list[MovieData]:
        raise NotImplementedError

    def details(self, external_id: str) -> MovieData:
        raise NotImplementedError

    # --- HTTP-запрос с кэшированием ответа в таблице api_cache ---
    def get_json(self, url: str, params: dict | None = None,
                 headers: dict | None = None, cache_key: str | None = None) -> dict:
        if cache_key:
            cached = self.db.scalar(
                select(ApiCache).where(ApiCache.provider == self.name,
                                       ApiCache.cache_key == cache_key[:255])
            )
            if cached and cached.expires_at > datetime.now():
                return json.loads(cached.payload)

        try:
            response = self.client.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            raise ProviderError(f"{self.title}: превышено время ожидания") from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self.title}: сервис недоступен") from exc

        if response.status_code in (401, 403):
            raise ProviderError(f"{self.title}: неверный или просроченный ключ API")
        if response.status_code == 429:
            raise ProviderError(f"{self.title}: исчерпан лимит запросов")
        if response.status_code == 404:
            raise ProviderError(f"{self.title}: фильм не найден")
        if response.status_code >= 400:
            raise ProviderError(f"{self.title}: ошибка {response.status_code}")

        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderError(f"{self.title}: некорректный ответ") from exc

        if cache_key:
            self._save_cache(cache_key[:255], data)
        return data

    def _save_cache(self, key: str, data: dict) -> None:
        expires = datetime.now() + timedelta(hours=settings.cache_ttl_hours)
        row = self.db.scalar(
            select(ApiCache).where(ApiCache.provider == self.name, ApiCache.cache_key == key)
        )
        if row is None:
            row = ApiCache(provider=self.name, cache_key=key)
            self.db.add(row)
        row.payload = json.dumps(data, ensure_ascii=False)
        row.expires_at = expires
        self.db.commit()


def parse_year(value) -> int | None:
    """Достаёт год из строки вида '2010-07-16', '2010–2014' или числа."""
    if value is None:
        return None
    text = str(value)[:4]
    return int(text) if text.isdigit() else None


def parse_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, 1) if number > 0 else None
