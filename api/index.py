"""Точка входа серверной части на Vercel (Python Serverless Function).

Vercel вызывает это ASGI-приложение для адресов /api/*, /docs и /openapi.json
(правила — в vercel.json). Клиентская часть собирается Vite и раздаётся как статика.

На Vercel нет постоянного диска: по умолчанию база SQLite создаётся в /tmp и заполняется
демонстрационными данными при холодном старте функции. Для постоянного хранения задайте
в настройках проекта переменную DATABASE_URL с адресом PostgreSQL (например, Neon).
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/kinodnevnik.db")
os.environ.setdefault("POSTER_CACHE_DIR", "/tmp/kinodnevnik-posters")

from app.main import app  # noqa: E402,F401
from app.seed import init_db  # noqa: E402
from app.services.enrich import enrich_in_background  # noqa: E402

init_db()  # на случай, если платформа не вызывает lifespan приложения
enrich_in_background()  # дополняет рейтингами только фильмы, у которых их ещё нет
