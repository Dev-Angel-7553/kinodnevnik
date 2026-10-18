"""Настройки приложения «КиноДневник».

Значения читаются из переменных окружения и файла backend/.env
(пример — в .env.example). Ключи внешних API необязательны:
без них поиск работает через Википедию, iTunes Search API и локальный каталог.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "КиноДневник"
    # SQLite по умолчанию; для PostgreSQL:
    # DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/kinodnevnik
    database_url: str = f"sqlite:///{BASE_DIR / 'kinodnevnik.db'}"

    secret_key: str = "change-me-please-32-characters-min"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # неделя

    # Ключи внешних API (бесплатные тарифы)
    tmdb_api_key: str = ""        # API Key v3 или API Read Access Token
    poiskkino_api_key: str = ""   # токен ПоискКино API (данные Кинопоиска)
    omdb_api_key: str = ""        # ключ OMDb API
    itunes_country: str = "us"    # витрина iTunes Search API (ключ не нужен)

    poster_cache_dir: Path | None = None  # по умолчанию static/posters/cache; на Vercel — /tmp

    http_timeout: float = 8.0
    cache_ttl_hours: int = 24
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()

# Адреса PostgreSQL от облачных сервисов (Neon, Supabase) приходят как postgres://… —
# SQLAlchemy нужен драйвер psycopg 3: postgresql+psycopg://…
for prefix in ("postgres://", "postgresql://"):
    if settings.database_url.startswith(prefix):
        settings.database_url = "postgresql+psycopg://" + settings.database_url.removeprefix(prefix)
        break
