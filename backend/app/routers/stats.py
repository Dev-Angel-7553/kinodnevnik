"""Личная статистика просмотров для страницы «Статистика»."""
from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User, UserMovie
from ..schemas import EntryOut, LabelValue, StatsOut

router = APIRouter(prefix="/api/stats", tags=["Статистика"])

MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def last_months(count: int = 12) -> list[tuple[int, int]]:
    """Список (год, месяц) за последние count месяцев, от старых к новым."""
    today = date.today()
    result = []
    year, month = today.year, today.month
    for _ in range(count):
        result.append((year, month))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return result[::-1]


@router.get("/me", response_model=StatsOut)
def my_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = list(db.scalars(select(UserMovie).where(UserMovie.user_id == user.id)).unique())
    watched = [e for e in entries if e.status == "watched"]
    rated = [e.rating for e in watched if e.rating]

    per_month = Counter((e.watched_at.year, e.watched_at.month) for e in watched if e.watched_at)
    by_month = [LabelValue(label=f"{MONTHS[m - 1]} {str(y)[2:]}", value=per_month.get((y, m), 0))
                for y, m in last_months()]

    genres = Counter(g.name for e in watched for g in e.movie.genres)
    by_genre = [LabelValue(label=name, value=n) for name, n in genres.most_common(8)]

    decades = Counter(e.movie.year // 10 * 10 for e in watched if e.movie.year)
    by_decade = [LabelValue(label=f"{d}-е", value=n) for d, n in sorted(decades.items())]

    marks = Counter(rated)
    distribution = [LabelValue(label=str(i), value=marks.get(i, 0)) for i in range(1, 11)]

    top = sorted((e for e in watched if e.rating),
                 key=lambda e: (e.rating, e.watched_at or date.min), reverse=True)[:5]

    return StatsOut(
        watched=len(watched),
        planned=sum(e.status == "planned" for e in entries),
        dropped=sum(e.status == "dropped" for e in entries),
        favorites=sum(e.is_favorite for e in entries),
        minutes=sum(e.movie.runtime or 0 for e in watched),
        avg_rating=round(sum(rated) / len(rated), 1) if rated else None,
        reviews=sum(bool(e.review) for e in entries),
        by_month=by_month,
        by_genre=by_genre,
        by_decade=by_decade,
        rating_distribution=distribution,
        top_rated=[EntryOut.model_validate(e) for e in top],
    )
