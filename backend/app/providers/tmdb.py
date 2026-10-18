"""The Movie Database (TMDB) API v3 — основной источник: русские описания и постеры."""
from ..config import settings
from .base import BaseProvider, MovieData, parse_float, parse_year

API = "https://api.themoviedb.org/3"
IMAGES = "https://image.tmdb.org/t/p/w500"


class TMDBProvider(BaseProvider):
    name = "tmdb"
    title = "TMDB"
    requires_key = True
    free_limit = "≈40 запросов/с, некоммерческое использование"

    def is_configured(self) -> bool:
        return bool(settings.tmdb_api_key)

    def _auth(self) -> tuple[dict, dict]:
        """TMDB принимает либо api_key в строке запроса, либо Bearer-токен (v4)."""
        key = settings.tmdb_api_key
        if key.startswith("eyJ"):
            return {}, {"Authorization": f"Bearer {key}"}
        return {"api_key": key}, {}

    def search(self, query: str, limit: int = 12) -> list[MovieData]:
        params, headers = self._auth()
        params |= {"query": query, "language": "ru-RU", "include_adult": "false", "page": 1}
        data = self.get_json(f"{API}/search/movie", params, headers, cache_key=f"search:{query.lower()}")
        return [self._short(item) for item in data.get("results", [])[:limit]]

    def popular(self, limit: int = 12) -> list[MovieData]:
        params, headers = self._auth()
        params |= {"language": "ru-RU"}
        data = self.get_json(f"{API}/trending/movie/week", params, headers, cache_key="trending")
        return [self._short(item) for item in data.get("results", [])[:limit]]

    def details(self, external_id: str) -> MovieData:
        params, headers = self._auth()
        params |= {"language": "ru-RU", "append_to_response": "credits"}
        item = self.get_json(f"{API}/movie/{external_id}", params, headers, cache_key=f"movie:{external_id}")
        movie = self._short(item)
        movie.runtime = item.get("runtime") or None
        movie.genres = [g["name"].lower() for g in item.get("genres", [])]
        movie.country = ", ".join(c["name"] for c in item.get("production_countries", [])[:2]) or None
        movie.imdb_id = item.get("imdb_id")
        crew = item.get("credits", {}).get("crew", [])
        movie.director = ", ".join(p["name"] for p in crew if p.get("job") == "Director") or None
        return movie

    def by_imdb(self, imdb_id: str) -> MovieData | None:
        """Поиск фильма по IMDb ID — для рейтинга TMDB и запасного постера."""
        params, headers = self._auth()
        params |= {"external_source": "imdb_id", "language": "ru-RU"}
        data = self.get_json(f"{API}/find/{imdb_id}", params, headers, cache_key=f"imdb:{imdb_id}")
        found = data.get("movie_results") or []
        if not found:
            return None
        movie = self._short(found[0])
        movie.imdb_id = imdb_id
        return movie

    @staticmethod
    def _short(item: dict) -> MovieData:
        poster = item.get("poster_path")
        return MovieData(
            source="tmdb",
            external_id=str(item["id"]),
            title=item.get("title") or item.get("original_title") or "Без названия",
            original_title=item.get("original_title"),
            year=parse_year(item.get("release_date")),
            overview=item.get("overview") or None,
            poster_url=f"{IMAGES}{poster}" if poster else None,
            rating_tmdb=parse_float(item.get("vote_average")),
        )
