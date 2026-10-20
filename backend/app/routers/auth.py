"""Регистрация, вход и данные текущего пользователя."""
import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Role, User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Авторизация"])

AVATAR_COLORS = ["#e8a87c", "#9cc5a1", "#8fb3e8", "#e3c567", "#c9a3d9", "#d98c8c"]


def token_response(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, user.role.code),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Создаёт учётную запись с ролью user и сразу выполняет вход."""
    fields = {}
    if db.scalar(select(User.id).where(func.lower(User.login) == data.login.lower())):
        fields["login"] = "Этот логин уже занят"
    if fields:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"message": "Пользователь уже существует", "fields": fields})

    role = db.scalar(select(Role).where(Role.code == "user"))
    user = User(
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
        login=data.login,
        password_hash=hash_password(data.password),
        role=role,
        avatar_color=random.choice(AVATAR_COLORS),
        last_login_at=datetime.now(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return token_response(user)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.login == data.login.strip()))
    # Одинаковое сообщение для неверного логина и пароля — не раскрываем, что именно не так
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    user.last_login_at = datetime.now()
    db.commit()
    return token_response(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
