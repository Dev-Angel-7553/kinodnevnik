"""Личный кабинет: редактирование профиля и история поиска."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import SearchHistory, User
from ..schemas import HistoryOut, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["Профиль"])


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in changes:
        changes["email"] = changes["email"].lower()
        taken = db.scalar(select(User.id).where(func.lower(User.email) == changes["email"],
                                                User.id != user.id))
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                detail={"message": "Email занят", "fields": {"email": "Этот email уже зарегистрирован"}})
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me/history", response_model=list[HistoryOut])
def my_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Последние 10 поисковых запросов пользователя."""
    return list(db.scalars(
        select(SearchHistory).where(SearchHistory.user_id == user.id)
        .order_by(SearchHistory.searched_at.desc(), SearchHistory.id.desc()).limit(10)
    ))


@router.delete("/me/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(SearchHistory).where(SearchHistory.user_id == user.id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
