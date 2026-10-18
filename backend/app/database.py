"""Подключение к базе данных через SQLAlchemy 2.0."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if is_sqlite else {},
    pool_pre_ping=True,
)

if is_sqlite:
    # В SQLite внешние ключи по умолчанию выключены — включаем при каждом подключении,
    # иначе не сработает каскадное удаление ON DELETE CASCADE.
    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()
        # Встроенная lower() в SQLite не понимает кириллицу — подменяем её
        # на Python-версию, чтобы поиск «интер» находил «Интерстеллар».
        dbapi_connection.create_function(
            "lower", 1, lambda s: s.lower() if isinstance(s, str) else s, deterministic=True
        )

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Базовый класс всех ORM-моделей."""


def get_db():
    """Зависимость FastAPI: открывает сессию на время запроса и закрывает её."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
