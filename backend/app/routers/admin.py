"""Административная панель: пользователи, журнал удалений, кэш API."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import ApiCache, DeletedUserLog, Movie, SearchHistory, User, UserMovie
from ..schemas import AdminStatsOut, AdminUserOut, DeletedLogOut, DeleteUserIn
from ..services.enrich import enrich_catalog

router = APIRouter(prefix="/api/admin", tags=["Администрирование"])


@router.get("/stats", response_model=AdminStatsOut)
def admin_stats(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    count = lambda model: db.scalar(select(func.count()).select_from(model))  # noqa: E731
    return AdminStatsOut(
        users=count(User), movies=count(Movie), entries=count(UserMovie),
        searches=count(SearchHistory), deleted=count(DeletedUserLog),
        cache_items=db.scalar(select(func.count()).select_from(ApiCache).where(ApiCache.provider != "app")),
    )


@router.get("/users", response_model=list[AdminUserOut])
def admin_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    counts = dict(db.execute(
        select(UserMovie.user_id, func.count(UserMovie.id)).group_by(UserMovie.user_id)
    ).all())
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).unique()
    result = []
    for user in users:
        item = AdminUserOut.model_validate(user)
        item.entries_count = counts.get(user.id, 0)
        result.append(item)
    return result


@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK, response_model=DeletedLogOut)
def delete_user(user_id: int, data: DeleteUserIn,
                admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Удаляет пользователя с указанием причины и записью в журнал.

    Связанные записи (дневник, история поиска) удаляются каскадно.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить собственную учётную запись")
    if user.role.code == "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить другого администратора")

    log = DeletedUserLog(user_id=user.id, login=user.login, email=user.email,
                         reason=data.reason.strip(), deleted_by=admin.login)
    db.add(log)
    db.delete(user)
    db.commit()
    db.refresh(log)
    return log


@router.get("/deleted", response_model=list[DeletedLogOut])
def deleted_log(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return list(db.scalars(select(DeletedUserLog).order_by(DeletedUserLog.deleted_at.desc())))


@router.delete("/cache", status_code=status.HTTP_200_OK)
def clear_cache(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    removed = db.execute(delete(ApiCache).where(ApiCache.provider != "app")).rowcount  # служебные записи остаются
    db.commit()
    return {"removed": removed}


@router.post("/enrich", status_code=status.HTTP_200_OK)
def enrich(_: User = Depends(require_admin)):
    """Дополняет фильмы каталога рейтингами Кинопоиска, TMDB и IMDb из подключённых API."""
    return enrich_catalog()
