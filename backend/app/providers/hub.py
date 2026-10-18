"""Агрегатор провайдеров: выбирает доступный API и переключается при сбое."""
import httpx
from sqlalchemy.orm import Session

from ..config import settings
from .base import BaseProvider, MovieData, ProviderError, log
from .itunes import ITunesProvider
from .omdb import OMDbProvider
from .poiskkino import PoiskKinoProvider
from .tmdb import TMDBProvider
from .wikipedia import WikipediaProvider

# Порядок опроса: сначала источники с ключом и русскими данными,
# затем бесплатные без ключа — Википедия (по-русски) и iTunes (запасной)
ORDER = ("tmdb", "poiskkino", "omdb", "wikipedia", "itunes")


class ProviderHub:
    def __init__(self, db: Session, client: httpx.Client | None = None):
        # client можно передать готовый — так в тестах подменяется сеть
        self.own_client = client is None
        self.client = client or httpx.Client(
            timeout=settings.http_timeout,
            headers={"User-Agent": "KinoDnevnik/1.0 (student course project) python-httpx"},
            follow_redirects=True,
        )
        self.providers: dict[str, BaseProvider] = {
            cls.name: cls(db, self.client)
            for cls in (TMDBProvider, PoiskKinoProvider, OMDbProvider, WikipediaProvider, ITunesProvider)
        }

    def close(self) -> None:
        if self.own_client:
            self.client.close()

    def available(self) -> list[BaseProvider]:
        return [self.providers[name] for name in ORDER if self.providers[name].is_configured()]

    def search(self, query: str, preferred: str | None = None) -> tuple[list[MovieData], str | None, list[str]]:
        """Ищет фильм у первого доступного провайдера; при ошибке пробует следующего.

        Возвращает (результаты, имя сработавшего провайдера, предупреждения).
        """
        warnings: list[str] = []
        candidates = self.available()
        if preferred:
            chosen = self.providers.get(preferred)
            if chosen and chosen.is_configured():
                candidates = [chosen] + [p for p in candidates if p is not chosen]
            else:
                warnings.append(f"Источник «{preferred}» не настроен — используется другой")

        for provider in candidates:
            try:
                results = provider.search(query)
            except ProviderError as exc:
                log.warning("search failed: %s", exc)
                warnings.append(str(exc))
                continue
            if results:
                return results, provider.name, warnings
        return [], None, warnings

    def details(self, source: str, external_id: str) -> MovieData:
        provider = self.providers.get(source)
        if provider is None or not provider.is_configured():
            raise ProviderError(f"Источник «{source}» не подключён")
        movie = provider.details(external_id)

        # Дополняем рейтингом IMDb через OMDb, если известен IMDb ID
        omdb = self.providers["omdb"]
        if movie.imdb_id and movie.rating_imdb is None and omdb.is_configured():
            try:
                movie.rating_imdb = omdb.imdb_rating(movie.imdb_id)
            except ProviderError as exc:
                log.info("omdb enrichment skipped: %s", exc)
        return movie

    def by_imdb(self, imdb_id: str, sources: tuple[str, ...] = ("poiskkino", "tmdb", "omdb")) -> list[MovieData]:
        """Сведения о фильме по IMDb ID из всех подключённых кинобаз с ключом (ошибки пропускаются)."""
        found = []
        for name in sources:
            provider = self.providers[name]
            if not provider.is_configured():
                continue
            try:
                movie = provider.by_imdb(imdb_id)
            except ProviderError as exc:
                log.info("by_imdb %s skipped: %s", name, exc)
                continue
            if movie:
                found.append(movie)
        return found

    def status(self) -> list[dict]:
        return [
            {
                "name": p.name,
                "title": p.title,
                "configured": p.is_configured(),
                "requires_key": p.requires_key,
                "free_limit": p.free_limit,
            }
            for p in (self.providers[name] for name in ORDER)
        ]
