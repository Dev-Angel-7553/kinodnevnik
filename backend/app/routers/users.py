"""Личный кабинет: редактирование профиля и история поиска."""
import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import SearchHistory, User
from ..schemas import AvatarIn, HistoryOut, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["Профиль"])


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
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


# ---------- Фото профиля ----------

AVATAR_TYPES = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG", "image/webp": b"RIFF"}
AVATAR_MAX = 300 * 1024


@router.put("/me/avatar", response_model=UserOut, summary="Загрузить фото профиля")
def upload_avatar(data: AvatarIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    head, _, payload = data.image.partition(",")
    kind = head.removeprefix("data:").removesuffix(";base64")
    bad = HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={"message": "Нужна картинка JPEG, PNG или WebP до 300 КБ", "fields": {}})
    if kind not in AVATAR_TYPES or not head.endswith(";base64"):
        raise bad
    try:
        content = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise bad from None
    # Проверяем «подпись» файла, а не только заявленный тип
    if len(content) > AVATAR_MAX or not content.startswith(AVATAR_TYPES[kind]):
        raise bad
    user.avatar, user.avatar_type = content, kind
    user.avatar_version = (user.avatar_version or 0) + 1
    db.commit()
    db.refresh(user)
    return user


@router.delete("/me/avatar", response_model=UserOut, summary="Удалить фото профиля")
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.avatar, user.avatar_type, user.avatar_version = None, None, 0
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}/avatar", summary="Фото профиля",
            responses={200: {"content": {"image/jpeg": {}}}, 404: {"description": "Фото нет"}})
def get_avatar(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None or not user.avatar_version or not user.avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Фото не загружено")
    # Адрес содержит версию фото, поэтому браузер может хранить картинку сколько угодно
    return Response(user.avatar, media_type=user.avatar_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
