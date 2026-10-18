"""Русская Википедия (MediaWiki Action API) — работает без ключа.

Даёт русские названия, краткое описание из вводной части статьи и постер
(иллюстрацию карточки фильма). Используется как основной бесплатный источник,
когда ключи TMDB и ПоискКино не заданы.
"""
import re

from .base import BaseProvider, MovieData, ProviderError

API = "https://ru.wikipedia.org/w/api.php"
FILM_WORDS = ("фильм", "мультфильм", "аниме", "кинофильм", "мюзикл")
YEAR_RE = re.compile(r"\b(18[89]\d|19\d\d|20\d\d)\b")


def _year(*texts: str | None) -> int | None:
    for text in texts:
        match = YEAR_RE.search(text or "")
        if match:
            return int(match.group(1))
    return None


class WikipediaProvider(BaseProvider):
    name = "wikipedia"
    title = "Википедия"
    requires_key = False
    free_limit = "без ключа, вежливые запросы"

    def _query(self, params: dict, cache_key: str) -> list[dict]:
        base = {"action": "query", "format": "json", "formatversion": 2,
                "prop": "pageimages|description|extracts", "piprop": "thumbnail",
                "pilicense": "any",  # постеры фильмов в Википедии несвободные; без этого их не вернут
                "exintro": 1, "explaintext": 1, "exsentences": 3, "exlimit": "max",
                "redirects": 1}
        data = self.get_json(API, base | params, cache_key=cache_key)
        if "error" in data:
            raise ProviderError(f"Википедия: {data['error'].get('info', 'ошибка запроса')}")
        pages = data.get("query", {}).get("pages", [])
        return sorted(pages, key=lambda p: p.get("index", 0))

    @staticmethod
    def _is_film(page: dict) -> bool:
        text = f"{page.get('description', '')} {page.get('extract', '')[:200]}".lower()
        return any(word in text for word in FILM_WORDS)

    def _parse(self, page: dict) -> MovieData:
        thumb = page.get("thumbnail") or {}
        title = page["title"]
        clean = re.sub(r"\s*\((?:фильм|мультфильм)[^)]*\)$", "", title)  # «Дюна (фильм, 2021)» → «Дюна»
        return MovieData(
            source="wikipedia",
            external_id=title[:120],
            title=clean,
            original_title=None,
            year=_year(page.get("description"), title, page.get("extract")),
            overview=(page.get("extract") or "").strip() or None,
            poster_url=thumb.get("source"),
        )

    def search(self, query: str, limit: int = 12) -> list[MovieData]:
        pages = self._query(
            {"generator": "search", "gsrsearch": f"{query} фильм", "gsrlimit": limit + 6,
             "gsrnamespace": 0, "pithumbsize": 500},
            cache_key=f"search:{query.lower()}",
        )
        return [self._parse(p) for p in pages if self._is_film(p)][:limit]

    def details(self, external_id: str) -> MovieData:
        pages = self._query({"titles": external_id, "pithumbsize": 700, "exsentences": 6},
                            cache_key=f"movie:{external_id}")
        if not pages or pages[0].get("missing"):
            raise ProviderError("Википедия: статья не найдена")
        return self._parse(pages[0])
