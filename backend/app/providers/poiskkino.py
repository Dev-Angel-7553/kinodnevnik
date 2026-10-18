"""ПоискКино API (бывш. kinopoisk.dev) — данные и рейтинги Кинопоиска."""
from ..config import settings
from .base import BaseProvider, MovieData, parse_float, parse_year

API = "https://api.poiskkino.dev/v1.4"


class PoiskKinoProvider(BaseProvider):
    name = "poiskkino"
    title = "ПоискКино (Кинопоиск)"
    requires_key = True
    free_limit = "200 запросов/сутки"

    def is_configured(self) -> bool:
        return bool(settings.poiskkino_api_key)

    def _headers(self) -> dict:
        return {"X-API-KEY": settings.poiskkino_api_key, "Accept": "application/json"}

    def search(self, query: str, limit: int = 12) -> list[MovieData]:
        params = {"query": query, "page": 1, "limit": limit}
        data = self.get_json(f"{API}/movie/search", params, self._headers(),
                             cache_key=f"search:{query.lower()}")
        return [self._parse(doc) for doc in data.get("docs", [])
                if doc.get("type") in (None, "movie", "cartoon", "anime")]

    def details(self, external_id: str) -> MovieData:
        doc = self.get_json(f"{API}/movie/{external_id}", headers=self._headers(),
                            cache_key=f"movie:{external_id}")
        movie = self._parse(doc)
        directors = [p.get("name") or p.get("enName") for p in doc.get("persons", [])
                     if p.get("enProfession") == "director"]
        movie.director = ", ".join(d for d in directors if d) or None
        movie.imdb_id = (doc.get("externalId") or {}).get("imdb")
        return movie

    def by_imdb(self, imdb_id: str) -> MovieData | None:
        """Поиск фильма по IMDb ID — для рейтинга Кинопоиска и запасного постера."""
        data = self.get_json(f"{API}/movie", {"externalId.imdb": imdb_id, "limit": 1}, self._headers(),
                             cache_key=f"imdb:{imdb_id}")
        docs = data.get("docs") or []
        if not docs:
            return None
        movie = self._parse(docs[0])
        movie.imdb_id = imdb_id
        return movie

    @staticmethod
    def _parse(doc: dict) -> MovieData:
        poster = doc.get("poster") or {}
        rating = doc.get("rating") or {}
        return MovieData(
            source="poiskkino",
            external_id=str(doc["id"]),
            title=doc.get("name") or doc.get("alternativeName") or doc.get("enName") or "Без названия",
            original_title=doc.get("alternativeName") or doc.get("enName"),
            year=parse_year(doc.get("year")),
            runtime=doc.get("movieLength") or None,
            overview=doc.get("description") or doc.get("shortDescription"),
            poster_url=poster.get("url") or poster.get("previewUrl"),
            country=", ".join(c["name"] for c in (doc.get("countries") or [])[:2]) or None,
            genres=[g["name"] for g in doc.get("genres") or []],
            rating_kp=parse_float(rating.get("kp")),
            rating_imdb=parse_float(rating.get("imdb")),
        )
