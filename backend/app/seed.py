"""Начальное заполнение базы: роли, учётные записи, демонстрационный каталог.

Запускается автоматически при первом старте (если таблица ролей пуста),
а также вручную: python -m app.seed --reset

У демо-данных есть версия (SEED_VERSION). Если база создана старой версией приложения,
при запуске каталог обновляется: подставляются локальные постеры и исправленные сведения.
Если в базе только демонстрационные учётные записи, она пересоздаётся целиком.
"""
import json
import random
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import func, select, text

from .config import BASE_DIR
from .database import Base, SessionLocal, engine
from .models import DeletedUserLog, Movie, Role, SearchHistory, User, UserMovie
from .security import hash_password
from .services.catalog import get_or_create_genres

USERS = [
    # login, password, фамилия, имя, роль, цвет аватара
    ("admin", "admin2026", "Смирнов", "Андрей", "admin", "#d98c8c"),
    ("demo", "demo2026", "Иванова", "Мария", "user", "#e3c567"),
    ("petrov_k", "kino2026", "Петров", "Кирилл", "user", "#9cc5a1"),
    ("anna_v", "kino2026", "Волкова", "Анна", "user", "#c9a3d9"),
    ("dmitry88", "kino2026", "Соколов", "Дмитрий", "user", "#8fb3e8"),
    ("lena_kino", "kino2026", "Морозова", "Елена", "user", "#e8a87c"),
    ("maxim_t", "kino2026", "Тихонов", "Максим", "user", "#9cc5a1"),
    ("promo_bot77", "kino2026", "Промо", "Бот", "user", "#a1a3a8"),
]

# Дневник демо-пользователя: slug, статус, оценка, рецензия, избранное, дней назад
DEMO_DIARY = [
    ("tt0816692", "watched", 10, "Пересматриваю раз в год. Сцена с часами на планете Миллер до сих пор пробирает.", True, 8),
    ("tt1877830", "watched", 9, "Самый мрачный и самый детективный Бэтмен. Звук в кинотеатре — отдельное удовольствие.", True, 19),
    ("tt6751668", "watched", 9, "Смешно, страшно и очень точно про социальное неравенство.", False, 27),
    ("tt2267998", "watched", 8, "Финчер умеет держать в напряжении до последней минуты.", False, 41),
    ("tt8579674", "watched", 7, None, False, 55),
    ("tt2582802", "watched", 9, "Последние десять минут — лучший финал, что я видела.", True, 63),
    ("tt2278388", "watched", 8, "Каждый кадр как открытка. Очень уютное кино.", False, 78),
    ("tt0245429", "watched", 10, "Сказка, в которую хочется возвращаться.", True, 92),
    ("tt5311514", "watched", 9, "Красиво до слёз, саундтрек слушаю до сих пор.", False, 105),
    ("tt1375666", "watched", 9, None, False, 121),
    ("tt0111161", "watched", 10, "Фильм про надежду. Без комментариев — шедевр.", True, 138),
    ("tt0211915", "watched", 7, None, False, 150),
    ("tt2380307", "watched", 9, "Плакала в конце, как и все.", False, 164),
    ("tt1392190", "watched", 8, None, False, 181),
    ("tt0482571", "watched", 9, "Пересмотрела, зная концовку, — вижу все подсказки.", False, 203),
    ("tt1675434", "watched", 9, "Тёплое кино про дружбу без капли пафоса.", True, 219),
    ("tt0091251", "watched", 10, "Очень тяжело, но это нужно увидеть хотя бы раз.", False, 236),
    ("tt0110413", "watched", 8, None, False, 251),
    ("tt1049413", "watched", 9, "Первые десять минут — целая жизнь без слов.", False, 274),
    ("tt0133093", "watched", 8, None, False, 296),
    ("tt0088763", "watched", 8, None, False, 318),
    ("tt0107048", "watched", 10, "Цитирую его всю жизнь.", True, 340),
    ("tt0993846", "dropped", 5, "Три часа одного и того же — бросила на середине.", False, 70),
    ("tt1160419", "planned", None, None, False, 3),
    ("tt1130884", "planned", None, None, False, 5),
    ("tt0120689", "planned", None, None, False, 12),
    ("tt0068646", "planned", None, None, False, 30),
    ("tt0338013", "planned", None, None, False, 45),
]

SEED_VERSION = 3

# Рецензии других зрителей подбираются по оценке, чтобы текст не спорил с числом
REVIEWS_BY_MOOD = {
    "high": [
        "Смотрел дважды — второй раз даже интереснее.",
        "Один из любимых фильмов, советую всем.",
        "Классика, которую стоит увидеть хотя бы раз.",
        "Пересматриваю каждый год, и не надоедает.",
        "Сильное кино: и сюжет, и актёры, и музыка на месте.",
    ],
    "mid": [
        "Сильная актёрская игра, но середина затянута.",
        "Визуально потрясающе, сюжет попроще.",
        "Хорошее кино, но второй раз смотреть не буду.",
    ],
    "low": [
        "Ожидал большего после всех восторгов.",
        "Не моё: затянуто и предсказуемо.",
    ],
}

DEMO_SEARCHES = ["интерстеллар", "дюна", "паразиты", "Нолан", "одержимость",
                 "гранд будапешт", "тайна коко", "Миядзаки"]


# rating_kp и rating_tmdb заполняются из ПоискКино и TMDB и сохраняются в каталог,
# чтобы не тратить дневной лимит API на каждом запуске
CATALOG_FIELDS = ("title", "original_title", "year", "runtime", "director", "country", "overview",
                  "rating_imdb", "rating_kp", "rating_tmdb", "imdb_id")


def read_catalog() -> list[dict]:
    return json.loads((BASE_DIR / "data" / "demo_catalog.json").read_text(encoding="utf-8"))


def apply_item(db, movie: Movie, item: dict) -> None:
    """Переносит сведения о фильме из демо-каталога в запись базы данных."""
    for field in CATALOG_FIELDS:
        setattr(movie, field, item.get(field))
    if (BASE_DIR / "static" / "posters" / f"{item['slug']}.jpg").is_file():
        movie.poster_url = f"/posters/{item['slug']}.jpg"
    movie.genres = get_or_create_genres(db, item["genres"])


def load_catalog(db) -> dict[str, Movie]:
    movies = {}
    for item in read_catalog():
        movie = Movie(source="demo", external_id=item["slug"])
        apply_item(db, movie, item)
        db.add(movie)
        movies[item["slug"]] = movie
    db.flush()
    return movies


def sync_catalog(db) -> int:
    """Обновляет фильмы демо-каталога в уже существующей базе (постеры, рейтинги, описания)."""
    updated = 0
    for item in read_catalog():
        movie = db.scalar(select(Movie).where(Movie.source == "demo", Movie.external_id == item["slug"]))
        if movie is None and item.get("imdb_id"):
            movie = db.scalar(select(Movie).where(Movie.imdb_id == item["imdb_id"]))
        if movie is None:
            movie = Movie(source="demo", external_id=item["slug"])
            db.add(movie)
        apply_item(db, movie, item)
        updated += 1
    db.commit()
    return updated


def community_rating(rnd: random.Random, movie: Movie) -> int:
    """Оценка демо-зрителя: разброс вокруг рейтинга IMDb, а не случайное число."""
    base = movie.rating_imdb or 7.5
    return max(4, min(10, round(rnd.gauss(base - 0.2, 0.8))))


def review_for(rnd: random.Random, rating: int) -> str:
    mood = "high" if rating >= 8 else "mid" if rating >= 6 else "low"
    return rnd.choice(REVIEWS_BY_MOOD[mood])


def seed(db) -> None:
    rnd = random.Random(2026)
    roles = {"admin": Role(code="admin", name="Администратор"), "user": Role(code="user", name="Пользователь")}
    db.add_all(roles.values())

    users = {}
    for i, (login, password, last, first, role, color) in enumerate(USERS):
        created = datetime.now() - timedelta(days=380 - i * 37, hours=rnd.randint(0, 20))
        user = User(login=login, password_hash=hash_password(password), last_name=last,
                    first_name=first, email=f"{login}@kinodnevnik.ru", role=roles[role],
                    avatar_color=color, created_at=created,
                    last_login_at=datetime.now() - timedelta(days=rnd.randint(0, 20)))
        db.add(user)
        users[login] = user
    db.flush()

    movies = load_catalog(db)
    today = date.today()

    for slug, status, rating, review, fav, days in DEMO_DIARY:
        stamp = datetime.now() - timedelta(days=days)
        db.add(UserMovie(user=users["demo"], movie=movies[slug], status=status, rating=rating,
                         review=review, is_favorite=fav,
                         watched_at=today - timedelta(days=days) if status != "planned" else None,
                         created_at=stamp, updated_at=stamp))

    slugs = list(movies)
    for login in ("petrov_k", "anna_v", "dmitry88", "lena_kino", "maxim_t"):
        for slug in rnd.sample(slugs, rnd.randint(24, 34)):
            days = rnd.randint(1, 330)
            planned = rnd.random() < 0.12
            rating = None if planned else community_rating(rnd, movies[slug])
            db.add(UserMovie(
                user=users[login], movie=movies[slug], status="planned" if planned else "watched",
                rating=rating,
                review=None if planned or rnd.random() < 0.7 else review_for(rnd, rating),
                watched_at=None if planned else today - timedelta(days=days),
                created_at=datetime.now() - timedelta(days=days),
                updated_at=datetime.now() - timedelta(days=days),
            ))

    for i, query in enumerate(DEMO_SEARCHES):
        db.add(SearchHistory(user=users["demo"], query=query, provider="local",
                             results_count=rnd.randint(1, 6),
                             searched_at=datetime.now() - timedelta(days=i * 4, hours=i)))

    db.add(DeletedUserLog(user_id=99, login="free_movies_hd", email="free_movies_hd@mail.ru",
                          reason="Рассылка ссылок на пиратские сайты в рецензиях",
                          deleted_by="admin", deleted_at=datetime.now() - timedelta(days=24)))
    db.commit()


def data_version(db) -> int:
    """Версия демо-данных хранится в служебном поле SQLite user_version."""
    if engine.dialect.name != "sqlite":
        return SEED_VERSION
    return db.execute(text("PRAGMA user_version")).scalar() or 0


def set_data_version(db) -> None:
    if engine.dialect.name == "sqlite":
        db.execute(text(f"PRAGMA user_version = {SEED_VERSION}"))
        db.commit()


def only_demo_accounts(db) -> bool:
    demo_logins = {login for login, *_ in USERS}
    return set(db.scalars(select(User.login))) <= demo_logins


def init_db(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(func.count()).select_from(Role)):
            seed(db)
            set_data_version(db)
            return
        if data_version(db) >= SEED_VERSION:
            return
        if only_demo_accounts(db):
            print("Демо-данные устарели — база пересоздаётся с новым каталогом")
            db.close()
            Base.metadata.drop_all(engine)
            Base.metadata.create_all(engine)
            with SessionLocal() as fresh:
                seed(fresh)
                set_data_version(fresh)
        else:
            print(f"Каталог обновлён: {sync_catalog(db)} фильмов")
            set_data_version(db)


if __name__ == "__main__":
    init_db(reset="--reset" in sys.argv)
    print("База данных готова")
