"""iTunes Search API (Apple) — работает без ключа, около 20 запросов в минуту."""
import re

from ..config import settings
from .base import BaseProvider, MovieData, ProviderError, genre_ru, parse_year

API = "https://itunes.apple.com"


class ITunesProvider(BaseProvider):
    name = "itunes"
    title = "iTunes Search"
    requires_key = False
    free_limit = "≈20 запросов/мин, без ключа"

    @staticmethod
    def _countries(query: str) -> list[str]:
        """Для запроса на кириллице сначала пробуем российскую витрину, затем основную."""
        main = settings.itunes_country.lower()
        if re.search(r"[а-яё]", query.lower()) and main != "ru":
            return ["ru", main]
        return [main]

    def search(self, query: str, limit: int = 12) -> list[MovieData]:
        for country in self._countries(query):
            params = {"term": query, "media": "movie", "entity": "movie", "limit": limit, "country": country}
            if country == "ru":
                params["lang"] = "ru_ru"
            data = self.get_json(f"{API}/search", params, cache_key=f"search:{country}:{query.lower()}")
            results = [self._parse(item) for item in data.get("results", []) if item.get("trackId")]
            if results:
                return results
        return []

    def details(self, external_id: str) -> MovieData:
        # Фильм мог быть найден в любой из витрин — проверяем обе
        for country in dict.fromkeys([settings.itunes_country.lower(), "ru"]):
            params = {"id": external_id, "country": country}
            data = self.get_json(f"{API}/lookup", params, cache_key=f"movie:{country}:{external_id}")
            if data.get("results"):
                return self._parse(data["results"][0])
        raise ProviderError("iTunes: фильм не найден")

    @staticmethod
    def _parse(item: dict) -> MovieData:
        artwork = item.get("artworkUrl100")
        millis = item.get("trackTimeMillis")
        genre = item.get("primaryGenreName")
        return MovieData(
            source="itunes",
            external_id=str(item["trackId"]),
            title=item.get("trackName") or "Без названия",
            original_title=item.get("trackName"),
            year=parse_year(item.get("releaseDate")),
            runtime=round(millis / 60000) if millis else None,
            overview=item.get("longDescription") or item.get("shortDescription"),
            # Apple отдаёт миниатюру 100×100 — подменяем размер в адресе на 600×900
            poster_url=artwork.replace("100x100bb", "600x900bb") if artwork else None,
            director=item.get("artistName"),
            genres=[genre_ru(genre)] if genre else [],
        )
