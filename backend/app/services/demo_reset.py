"""Периодический сброс демонстрационной базы (для публичного демо, например на Vercel).

Если в настройках задано DEMO_RESET_MINUTES (на Vercel — 30), база пересоздаётся
с демонстрационными данными, когда с последнего заполнения прошло больше этого времени.
Сброс «ленивый»: его выполняет первый запрос после истечения срока, отдельный планировщик
не нужен (на бесплатном тарифе Vercel его и нет). Время заполнения хранится служебной
записью в таблице api_cache (provider = "app"), поэтому новая таблица не требуется.
"""
import threading
import time
from datetime import datetime, timedelta

from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..models import ApiCache

SYSTEM = "app"          # служебные записи в api_cache — не ответы внешних API
KEY = "demo_seeded_at"
CHECK_EVERY = 20        # секунд между проверками, чтобы не обращаться к базе на каждый запрос

_lock = threading.Lock()
_checked_at = 0.0


def mark_seeded(db) -> None:
    """Запоминает момент заполнения базы (вызывается из seed)."""
    row = db.scalar(select(ApiCache).where(ApiCache.provider == SYSTEM, ApiCache.cache_key == KEY))
    if row is None:
        row = ApiCache(provider=SYSTEM, cache_key=KEY)
        db.add(row)
    now = time.time()
    row.payload = str(now)
    row.expires_at = datetime.now() + timedelta(minutes=settings.demo_reset_minutes or 0)


def seeded_at() -> float | None:
    with SessionLocal() as db:
        row = db.scalar(select(ApiCache).where(ApiCache.provider == SYSTEM, ApiCache.cache_key == KEY))
        try:
            return float(row.payload) if row else None
        except ValueError:
            return None


def due(now: float | None = None) -> bool:
    minutes = settings.demo_reset_minutes
    if not minutes:
        return False
    stamp = seeded_at()
    return stamp is None or (now or time.time()) - stamp >= minutes * 60


def maybe_reset(force_check: bool = False) -> bool:
    """Пересоздаёт базу, если пора. Возвращает True, если сброс был выполнен."""
    global _checked_at
    if not settings.demo_reset_minutes:
        return False
    if _lock.locked():  # сброс уже идёт в другом запросе — дожидаемся его окончания
        with _lock:
            return False
    now = time.time()
    if not force_check and now - _checked_at < CHECK_EVERY:
        return False
    with _lock:  # одновременно сбрасывает только один запрос, остальные ждут его
        _checked_at = now
        if not due(now):
            return False
        from ..seed import init_db
        init_db(reset=True)
        return True
