"""Кэш постеров внешних кинобаз.

Постеры фильмов из TMDB, Википедии, iTunes и других источников браузер получает не напрямую,
а через сервер: адрес вида /api/posters?url=… Сервер один раз скачивает картинку, сохраняет
её в static/posters/cache и дальше отдаёт с диска. Так постеры
  * не зависят от того, разрешает ли сайт-источник показывать свои картинки на чужих страницах;
  * открываются повторно без обращения к внешнему сайту, в том числе без интернета;
  * приходят с того же адреса, что и приложение, и цвет страницы фильма можно вычислить по постеру.
"""
import hashlib
import re
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx

from ..config import BASE_DIR, settings

LOCAL_DIR = BASE_DIR / "static" / "posters"
CACHE_DIR = settings.poster_cache_dir or LOCAL_DIR / "cache"
MAX_BYTES = 4 * 1024 * 1024
TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

# Скачиваем картинки только с адресов кинобаз, а не с любого сайта
ALLOWED_HOSTS = (
    "image.tmdb.org",          # TMDB
    "wikimedia.org",           # Википедия (upload. и thumb.)
    "mzstatic.com",            # iTunes
    "media-amazon.com",        # OMDb (постеры IMDb)
    "yandex.net",              # Кинопоиск
    "kinopoisk.ru",
    "kinopoisk.dev",
    "openmoviedb.com",         # ПоискКино
    "poiskkino.dev",
)

USER_AGENT = "KinoDnevnik/1.0 (student course project) python-httpx"


def is_allowed(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme in ("http", "https") and any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def local_url(imdb_id: str | None) -> str | None:
    """Постер из комплекта приложения (static/posters/<IMDb ID>.jpg), если он есть."""
    if imdb_id and re.fullmatch(r"tt\d{5,10}", imdb_id) and (LOCAL_DIR / f"{imdb_id}.jpg").is_file():
        return f"/posters/{imdb_id}.jpg"
    return None


def proxied(url: str | None, imdb_id: str | None = None) -> str | None:
    """Адрес постера для браузера: свой файл, если есть; внешние картинки — через кэш сервера."""
    if local := local_url(imdb_id):
        return local
    if url and is_allowed(url):
        return f"/api/posters?url={quote(url, safe='')}"
    return url


def for_movie_url(movie_id: int, url: str | None, imdb_id: str | None) -> str | None:
    """Адрес постера фильма из каталога: с запасными источниками, если основной не загрузится."""
    if local := local_url(imdb_id):
        return local
    if url and url.startswith("/"):
        return url
    return f"/api/posters/movie/{movie_id}"


def _key(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:24]


def cached_file(url: str) -> Path | None:
    for ext in TYPES.values():
        file = CACHE_DIR / f"{_key(url)}{ext}"
        if file.is_file():
            return file
    return None


def fetch(url: str, client: httpx.Client | None = None) -> Path | None:
    """Возвращает файл постера из кэша или скачивает его. None — если скачать не удалось."""
    if not is_allowed(url):
        return None
    file = cached_file(url)
    if file:
        return file
    own = client is None
    client = client or httpx.Client(timeout=settings.http_timeout, follow_redirects=True,
                                    headers={"User-Agent": USER_AGENT})
    try:
        response = client.get(url)
        kind = response.headers.get("content-type", "").split(";")[0].strip()
        if response.status_code != 200 or kind not in TYPES or len(response.content) > MAX_BYTES:
            return None
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        file = CACHE_DIR / f"{_key(url)}{TYPES[kind]}"
        file.write_bytes(response.content)
        return file
    except httpx.HTTPError:
        return None
    finally:
        if own:
            client.close()


# --- Постер фильма из каталога с запасными источниками ---------------------------------

_misses: dict[int, float] = {}  # фильмы, для которых постер не нашёлся: не ищем повторно час
MISS_TTL = 3600


def _norm(text: str | None) -> str:
    return re.sub(r"[^\w]+", "", (text or "").casefold().replace("ё", "е"))


def same_film(found, movie) -> bool:
    """Результат поиска относится к тому же фильму: совпадает название и год (±1)."""
    if found.year and movie.year and abs(found.year - movie.year) > 1:
        return False
    names = {_norm(movie.title), _norm(movie.original_title)} - {""}
    return bool(names & ({_norm(found.title), _norm(found.original_title)} - {""}))


def alternatives(db, movie, client: httpx.Client | None = None):
    """Адреса постеров этого фильма в других кинобазах: по IMDb ID, затем поиском по названию."""
    from ..providers.base import ProviderError
    from ..providers.hub import ProviderHub

    hub = ProviderHub(db, client)
    try:
        if movie.imdb_id:
            for found in hub.by_imdb(movie.imdb_id):
                if found.poster_url:
                    yield found.poster_url
        for name, query in (("wikipedia", movie.title), ("itunes", movie.original_title or movie.title)):
            try:
                results = hub.providers[name].search(query, limit=6)
            except ProviderError:
                continue
            for found in results:
                if found.poster_url and same_film(found, movie):
                    yield found.poster_url
    finally:
        hub.close()


def for_movie(db, movie, client: httpx.Client | None = None) -> Path | None:
    """Файл постера фильма: основной адрес, а если он недоступен — постер из другой кинобазы.

    Найденный запасной адрес сохраняется в карточке фильма, поэтому поиск выполняется один раз.
    """
    if local := local_url(movie.imdb_id):
        return LOCAL_DIR / local.removeprefix("/posters/")
    if movie.poster_url and (file := fetch(movie.poster_url, client)):
        return file
    if time.monotonic() - _misses.get(movie.id, -MISS_TTL) < MISS_TTL:
        return None
    tried = {movie.poster_url}
    for url in alternatives(db, movie, client):
        if url in tried:
            continue
        tried.add(url)
        if file := fetch(url, client):
            movie.poster_url = url
            db.commit()
            return file
    _misses[movie.id] = time.monotonic()
    return None
