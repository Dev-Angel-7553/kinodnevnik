"""Автотесты REST API «КиноДневник».

Запуск: pytest -v  (из папки backend)
Тесты работают на отдельной временной базе и не обращаются в интернет:
ответы внешних API подменяются через httpx.MockTransport.
"""
import os
import tempfile

import httpx
import pytest

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

from fastapi.testclient import TestClient  # noqa: E402

from sqlalchemy import select, text  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Movie  # noqa: E402
from app.providers.hub import ProviderHub  # noqa: E402
from app.schemas import SearchItem  # noqa: E402
from app.seed import init_db  # noqa: E402
from app.services import enrich, posters  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def auth(client, login="demo", password="demo2026"):
    token = client.post("/api/auth/login", json={"login": login, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------- Регистрация и вход ----------

def test_register_success(client):
    r = client.post("/api/auth/register", json={
        "last_name": "Тестов", "first_name": "Иван", "login": "tester_1",
        "email": "tester@example.ru", "password": "secret123", "password_confirm": "secret123"})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "user"


def test_register_validation_errors(client):
    r = client.post("/api/auth/register", json={
        "last_name": "Т3", "first_name": "Иван", "login": "a b", "email": "bad",
        "password": "123", "password_confirm": "123"})
    fields = r.json()["detail"]["fields"]
    assert r.status_code == 422
    assert {"last_name", "login", "email", "password"} <= fields.keys()


def test_register_password_mismatch(client):
    r = client.post("/api/auth/register", json={
        "last_name": "Тестов", "first_name": "Иван", "login": "tester_2",
        "email": "t2@example.ru", "password": "secret123", "password_confirm": "secret124"})
    assert r.json()["detail"]["fields"]["password_confirm"] == "Пароли не совпадают"


def test_register_duplicate_login(client):
    r = client.post("/api/auth/register", json={
        "last_name": "Тестов", "first_name": "Иван", "login": "demo",
        "email": "new@example.ru", "password": "secret123", "password_confirm": "secret123"})
    assert r.status_code == 409
    assert "login" in r.json()["detail"]["fields"]


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"login": "demo", "password": "wrong"})
    assert r.status_code == 401


def test_password_is_hashed(client):
    from app.models import User
    with SessionLocal() as db:
        user = db.query(User).filter_by(login="demo").one()
        assert user.password_hash.startswith("$2b$") and "demo2026" not in user.password_hash


# ---------- Доступ ----------

def test_library_requires_auth(client):
    assert client.get("/api/library").status_code == 401


def test_admin_forbidden_for_user(client):
    assert client.get("/api/admin/users", headers=auth(client)).status_code == 403


def test_foreign_entry_is_hidden(client):
    other = client.get("/api/library", headers=auth(client, "petrov_k", "kino2026")).json()[0]
    r = client.patch(f"/api/library/{other['id']}", json={"rating": 1}, headers=auth(client))
    assert r.status_code == 404


# ---------- Каталог, поиск, дневник ----------

def test_local_search_cyrillic(client):
    r = client.get("/api/movies/search", params={"q": "интер"})
    titles = [i["title"] for i in r.json()["items"]]
    assert "Интерстеллар" in titles


def test_add_and_update_entry(client):
    h = auth(client, "tester_1", "secret123")
    r = client.post("/api/library", json={"movie_id": 1, "status": "watched", "rating": 9}, headers=h)
    assert r.status_code == 201 and r.json()["watched_at"]
    r = client.patch(f"/api/library/{r.json()['id']}", json={"status": "planned"}, headers=h)
    assert r.json()["rating"] is None and r.json()["watched_at"] is None


def test_rating_out_of_range(client):
    r = client.post("/api/library", json={"movie_id": 2, "rating": 11}, headers=auth(client))
    assert r.status_code == 422


def test_stats(client):
    s = client.get("/api/stats/me", headers=auth(client)).json()
    assert s["watched"] == 22 and len(s["by_month"]) == 12


def test_top_rated_is_weighted(client):
    top = client.get("/api/movies/catalog", params={"sort": "rating", "limit": 6}).json()
    # Пара «десяток» от демо-зрителей не поднимает фильм выше признанной классики
    assert all(m["rating_imdb"] >= 8.3 for m in top)
    assert all(m["votes"] >= 1 and 4 <= m["community_rating"] <= 10 for m in top)


def test_old_database_is_updated(client):
    with SessionLocal() as db:
        dune = db.scalar(select(Movie).where(Movie.external_id == "tt1160419"))
        dune.poster_url, dune.rating_imdb = None, 1.0  # как в базе старой версии
        db.execute(text("PRAGMA user_version = 0"))
        db.commit()
    init_db()  # в базе есть свои пользователи — каталог обновляется без пересоздания
    with SessionLocal() as db:
        dune = db.scalar(select(Movie).where(Movie.external_id == "tt1160419"))
        assert dune.poster_url == "/posters/tt1160419.jpg" and dune.rating_imdb == 8.0
        assert db.execute(text("PRAGMA user_version")).scalar() >= 4
        assert dune.rating_kp == 7.7
    assert client.post("/api/auth/login", json={"login": "tester_1", "password": "secret123"}).status_code == 200


# ---------- Внешние API (без сети, через MockTransport) ----------

def fake_api(request: httpx.Request) -> httpx.Response:
    if "themoviedb" in request.url.host:
        return httpx.Response(429)
    if "itunes" in request.url.host:
        return httpx.Response(200, json={"results": [{
            "trackId": 1, "trackName": "Inception", "artistName": "Christopher Nolan",
            "releaseDate": "2010-07-16T07:00:00Z", "primaryGenreName": "Sci-Fi & Fantasy",
            "artworkUrl100": "https://example.com/100x100bb.jpg", "trackTimeMillis": 8880000}]})
    return httpx.Response(404)


def fake_wiki(request: httpx.Request) -> httpx.Response:
    assert request.url.host == "ru.wikipedia.org"
    assert request.url.params["generator"] == "search"
    return httpx.Response(200, json={"batchcomplete": True, "query": {"pages": [
        {"pageid": 2, "ns": 0, "title": "Дюна (роман)", "index": 1,
         "description": "научно-фантастический роман Фрэнка Герберта", "extract": "Роман 1965 года."},
        {"pageid": 3, "ns": 0, "title": "Дюна (саундтрек)", "index": 3,
         "description": "саундтрек к фильму 2021 года", "extract": "Альбом Ханса Циммера."},
        {"pageid": 1, "ns": 0, "title": "Дюна (фильм, 2021)", "index": 2,
         "description": "фильм Дени Вильнёва 2021 года",
         "thumbnail": {"source": "https://upload.wikimedia.org/dune.jpg", "width": 260, "height": 385},
         "extract": "«Дюна» — американский научно-фантастический фильм."},
    ]}})


def test_wikipedia_provider_without_key():
    with SessionLocal() as db:
        hub = ProviderHub(db)
        hub.client = httpx.Client(transport=httpx.MockTransport(fake_wiki))
        for provider in hub.providers.values():
            provider.client = hub.client
        results, used, _ = hub.search("Дюна", "wikipedia")
    assert used == "wikipedia"
    assert [r.title for r in results] == ["Дюна"]  # роман и саундтрек отфильтрованы, уточнение убрано
    assert results[0].year == 2021 and results[0].poster_url.endswith("dune.jpg")


def test_provider_fallback():
    settings.tmdb_api_key = "test-key"
    try:
        with SessionLocal() as db:
            hub = ProviderHub(db)
            hub.client = httpx.Client(transport=httpx.MockTransport(fake_api))
            for provider in hub.providers.values():
                provider.client = hub.client
            results, used, warnings = hub.search("Inception")
    finally:
        settings.tmdb_api_key = ""
    assert used == "itunes"  # TMDB вернул 429, Википедия недоступна — поиск дошёл до iTunes
    assert "исчерпан лимит" in warnings[0]
    assert any("Википедия" in w for w in warnings)
    assert results[0].runtime == 148 and results[0].genres == ["фантастика"]
    assert results[0].poster_url.endswith("600x900bb.jpg")


def test_poster_cache(client, tmp_path, monkeypatch):
    monkeypatch.setattr(posters, "CACHE_DIR", tmp_path)
    calls = []

    def fake_image(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, content=b"\xff\xd8jpeg", headers={"content-type": "image/jpeg"})

    url = "https://upload.wikimedia.org/wikipedia/ru/a/a1/Dune.jpg"
    mock = httpx.Client(transport=httpx.MockTransport(fake_image))
    first = posters.fetch(url, mock)
    second = posters.fetch(url, mock)
    assert first == second and first.read_bytes() == b"\xff\xd8jpeg"
    assert len(calls) == 1  # второй раз постер взят из кэша, без обращения к сайту
    # Ответ API подставляет адрес кэша, а постеры с чужих сайтов не скачиваются
    item = SearchItem(source="wikipedia", external_id="Дюна", title="Дюна", poster_url=url).model_dump()
    assert item["poster_url"].startswith("/api/posters?url=https%3A%2F%2Fupload.wikimedia.org")
    assert posters.is_allowed("https://thumb.wikimedia.org/wikipedia/ru/thumb/b/bf/x.jpg/500px-x.jpg")
    assert posters.fetch("https://example.com/x.jpg", mock) is None
    assert client.get("/api/posters", params={"url": "https://example.com/poster.jpg"}).status_code == 404


def test_poster_fallback_to_other_source(client, tmp_path, monkeypatch):
    monkeypatch.setattr(posters, "CACHE_DIR", tmp_path)

    def network(request: httpx.Request) -> httpx.Response:
        if request.url.host == "image.tmdb.org":
            return httpx.Response(403)  # основной постер недоступен
        if request.url.host == "ru.wikipedia.org":
            return fake_wiki(request)
        if request.url.host == "upload.wikimedia.org":
            return httpx.Response(200, content=b"\xff\xd8wiki", headers={"content-type": "image/jpeg"})
        return httpx.Response(404)

    with SessionLocal() as db:
        movie = Movie(title="Дюна", original_title="Dune", year=2021, source="tmdb", external_id="438631",
                      poster_url="https://image.tmdb.org/t/p/w500/dune.jpg")
        db.add(movie)
        db.commit()
        assert SearchItem(source="tmdb", external_id="1", title="Дюна", poster_url=movie.poster_url,
                          local_id=movie.id).model_dump()["poster_url"] == f"/api/posters/movie/{movie.id}"
        file = posters.for_movie(db, movie, httpx.Client(transport=httpx.MockTransport(network)))
        assert file.read_bytes() == b"\xff\xd8wiki"
        assert movie.poster_url == "https://upload.wikimedia.org/dune.jpg"  # запасной адрес запомнен


def test_enrich_ratings_by_imdb(client, monkeypatch):
    monkeypatch.setattr(settings, "poiskkino_api_key", "test-key")

    def poiskkino(request: httpx.Request) -> httpx.Response:
        assert request.url.params["externalId.imdb"].startswith("tt")
        return httpx.Response(200, json={"docs": [{"id": 1, "name": "Фильм", "year": 2000,
                                                    "rating": {"kp": 8.4, "imdb": 8.1}}]})

    with SessionLocal() as db:  # у каталога рейтинги уже есть — сбрасываем их у трёх фильмов
        for movie in db.scalars(select(Movie).where(Movie.imdb_id.is_not(None)).limit(3)):
            movie.rating_kp = None
        db.commit()
    result = enrich.enrich_catalog(limit=3, client=httpx.Client(transport=httpx.MockTransport(poiskkino)))
    assert result["updated"] == 3
    with SessionLocal() as db:
        assert db.scalar(select(Movie).where(Movie.rating_kp == 8.4).limit(1)) is not None


# ---------- Администрирование ----------

def test_admin_delete_user_with_log(client):
    h = auth(client, "admin", "admin2026")
    target = next(u for u in client.get("/api/admin/users", headers=h).json() if u["login"] == "tester_1")
    r = client.request("DELETE", f"/api/admin/users/{target['id']}", json={"reason": "Тестовое удаление"}, headers=h)
    assert r.status_code == 200
    logins = [row["login"] for row in client.get("/api/admin/deleted", headers=h).json()]
    assert "tester_1" in logins


def test_admin_cannot_delete_self(client):
    h = auth(client, "admin", "admin2026")
    r = client.request("DELETE", "/api/admin/users/1", json={"reason": "проверка"}, headers=h)
    assert r.status_code == 400


# ---------- Сброс демо-базы ----------

def test_demo_reset_every_n_minutes(client, monkeypatch):
    from app.services import demo_reset

    monkeypatch.setattr(settings, "demo_reset_minutes", 30)
    client.post("/api/auth/register", json={
        "last_name": "Временный", "first_name": "Гость", "login": "temp_guest",
        "email": "temp@example.ru", "password": "secret123", "password_confirm": "secret123"})
    assert demo_reset.maybe_reset(force_check=True) is False  # 30 минут ещё не прошло
    with SessionLocal() as db:  # «перематываем» время заполнения на 31 минуту назад
        row = db.scalar(select(demo_reset.ApiCache).where(demo_reset.ApiCache.cache_key == demo_reset.KEY))
        row.payload = str(float(row.payload) - 31 * 60)
        db.commit()
    assert demo_reset.maybe_reset(force_check=True) is True
    assert client.post("/api/auth/login", json={"login": "temp_guest", "password": "secret123"}).status_code == 401
    assert client.post("/api/auth/login", json={"login": "demo", "password": "demo2026"}).status_code == 200
    assert client.get("/api/health").json()["demo_reset_minutes"] == 30
