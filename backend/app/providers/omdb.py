"""OMDb API — рейтинги IMDb, Rotten Tomatoes и Metacritic по IMDb ID."""
from ..config import settings
from .base import BaseProvider, MovieData, ProviderError, genre_ru, parse_float, parse_year

API = "https://www.omdbapi.com/"


class OMDbProvider(BaseProvider):
    name = "omdb"
    title = "OMDb"
    requires_key = True
    free_limit = "1000 запросов/сутки"

    def is_configured(self) -> bool:
        return bool(settings.omdb_api_key)

    def _request(self, params: dict, cache_key: str) -> dict:
        data = self.get_json(API, {"apikey": settings.omdb_api_key, **params}, cache_key=cache_key)
        if data.get("Response") == "False":
            error = data.get("Error", "")
            if "not found" in error.lower():
                return {}
            raise ProviderError(f"OMDb: {error}")
        return data

    def search(self, query: str, limit: int = 12) -> list[MovieData]:
        data = self._request({"s": query, "type": "movie"}, f"search:{query.lower()}")
        return [
            MovieData(
                source="omdb",
                external_id=item["imdbID"],
                title=item["Title"],
                original_title=item["Title"],
                year=parse_year(item.get("Year")),
                poster_url=item["Poster"] if item.get("Poster", "N/A") != "N/A" else None,
                imdb_id=item["imdbID"],
            )
            for item in data.get("Search", [])[:limit]
        ]

    def details(self, external_id: str) -> MovieData:
        item = self._request({"i": external_id, "plot": "full"}, f"movie:{external_id}")
        if not item:
            raise ProviderError("OMDb: фильм не найден")
        runtime = (item.get("Runtime") or "").split(" ")[0]
        return MovieData(
            source="omdb",
            external_id=external_id,
            title=item["Title"],
            original_title=item["Title"],
            year=parse_year(item.get("Year")),
            runtime=int(runtime) if runtime.isdigit() else None,
            overview=item.get("Plot") if item.get("Plot") != "N/A" else None,
            poster_url=item["Poster"] if item.get("Poster", "N/A") != "N/A" else None,
            country=item.get("Country") if item.get("Country") != "N/A" else None,
            director=item.get("Director") if item.get("Director") != "N/A" else None,
            genres=[genre_ru(g) for g in (item.get("Genre") or "").split(",") if g.strip()],
            imdb_id=external_id,
            rating_imdb=parse_float(item.get("imdbRating")),
        )

    def imdb_rating(self, imdb_id: str) -> float | None:
        """Дополнение карточки фильма рейтингом IMDb (используется для TMDB и iTunes)."""
        item = self._request({"i": imdb_id}, f"movie:{imdb_id}")
        return parse_float(item.get("imdbRating")) if item else None

    def by_imdb(self, imdb_id: str) -> MovieData | None:
        try:
            return self.details(imdb_id)
        except ProviderError as exc:
            if "не найден" in str(exc):
                return None
            raise
