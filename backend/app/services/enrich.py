"""Уточнение каталога данными кинобаз.

Если заданы ключи ПоискКино, TMDB или OMDb, сервер дополняет фильмы каталога настоящими
рейтингами Кинопоиска, TMDB и IMDb (по IMDb ID). Запускается в фоне при старте сервера
и вручную из админ-панели. Ответы API кэшируются, поэтому повторный запуск почти бесплатен.
"""
import logging
import threading

import httpx
from sqlalchemy import or_, select

from ..database import SessionLocal
from ..models import Movie
from ..providers.hub import ProviderHub

log = logging.getLogger("kinodnevnik.enrich")
KEYED = ("poiskkino", "tmdb", "omdb")
_lock = threading.Lock()


def enrich_catalog(limit: int = 60, client: httpx.Client | None = None) -> dict:
    """Заполняет недостающие рейтинги фильмов. Возвращает число обновлённых фильмов."""
    if not _lock.acquire(blocking=False):
        return {"updated": 0, "checked": 0, "busy": True}
    try:
        with SessionLocal() as db:
            hub = ProviderHub(db, client)
            try:
                sources = tuple(n for n in KEYED if hub.providers[n].is_configured())
                if not sources:
                    return {"updated": 0, "checked": 0, "sources": []}
                need = []
                if "poiskkino" in sources:
                    need.append(Movie.rating_kp.is_(None))
                if "tmdb" in sources:
                    need.append(Movie.rating_tmdb.is_(None))
                if "omdb" in sources:
                    need.append(Movie.rating_imdb.is_(None))
                movies = list(db.scalars(
                    select(Movie).where(Movie.imdb_id.is_not(None), or_(*need)).limit(limit)))
                updated = 0
                for movie in movies:
                    wanted = tuple(name for name, field in (("poiskkino", "rating_kp"), ("tmdb", "rating_tmdb"),
                                                            ("omdb", "rating_imdb"))
                                   if name in sources and getattr(movie, field) is None)
                    changed = False
                    for found in hub.by_imdb(movie.imdb_id, wanted):
                        for field in ("rating_kp", "rating_tmdb", "rating_imdb"):
                            value = getattr(found, field)
                            if value and getattr(movie, field) is None:
                                setattr(movie, field, value)
                                changed = True
                    if changed:
                        updated += 1
                        db.commit()
                log.info("enrich: %s of %s movies updated", updated, len(movies))
                return {"updated": updated, "checked": len(movies), "sources": list(sources)}
            finally:
                hub.close()
    finally:
        _lock.release()


def enrich_in_background() -> None:
    threading.Thread(target=enrich_catalog, name="enrich-catalog", daemon=True).start()
