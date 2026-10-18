"""Pydantic-схемы: проверка входных данных и формат ответов API."""
import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator, model_validator

from .services.posters import for_movie_url, proxied

NAME_RE = re.compile(r"^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]{1,49}$")
LOGIN_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")
PASSWORD_RE = re.compile(r"^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{8,64}$")

Status = Literal["watched", "planned", "dropped"]


# ---------- Пользователи и авторизация ----------

class RegisterIn(BaseModel):
    last_name: str
    first_name: str
    middle_name: str | None = None
    login: str
    email: EmailStr
    password: str
    password_confirm: str

    @field_validator("last_name", "first_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not NAME_RE.fullmatch(value):
            raise ValueError("Только буквы и дефис, от 2 до 50 символов")
        return value

    @field_validator("middle_name")
    @classmethod
    def check_middle_name(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        if not NAME_RE.fullmatch(value.strip()):
            raise ValueError("Только буквы и дефис, от 2 до 50 символов")
        return value.strip()

    @field_validator("login")
    @classmethod
    def check_login(cls, value: str) -> str:
        if not LOGIN_RE.fullmatch(value):
            raise ValueError("Латиница, цифры и «_», от 3 до 32 символов")
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        if not PASSWORD_RE.fullmatch(value):
            raise ValueError("Не менее 8 символов, хотя бы одна буква и одна цифра")
        return value

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError("Пароли не совпадают")
        return self


class LoginIn(BaseModel):
    login: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    last_name: str
    first_name: str
    middle_name: str | None
    login: str
    email: str
    role: str
    avatar_color: str
    created_at: datetime

    @field_validator("role", mode="before")
    @classmethod
    def role_code(cls, value):
        return getattr(value, "code", value)


class UserUpdate(BaseModel):
    last_name: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    email: EmailStr | None = None
    avatar_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("last_name", "first_name", "middle_name")
    @classmethod
    def check_name(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not NAME_RE.fullmatch(value):
            raise ValueError("Только буквы и дефис, от 2 до 50 символов")
        return value


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Фильмы ----------

class MovieOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_title: str | None
    year: int | None
    runtime: int | None
    overview: str | None
    poster_url: str | None
    country: str | None
    director: str | None
    source: str
    external_id: str
    imdb_id: str | None = None
    rating_imdb: float | None
    rating_kp: float | None
    rating_tmdb: float | None
    genres: list[str] = []

    @field_validator("genres", mode="before")
    @classmethod
    def genre_names(cls, value):
        return [getattr(g, "name", g) for g in value or []]

    @field_serializer("poster_url")
    def poster_address(self, value: str | None) -> str | None:
        # Свой файл постера, если есть; иначе — через сервер с запасными кинобазами
        return for_movie_url(self.id, value, self.imdb_id)


class CatalogItem(MovieOut):
    """Фильм каталога со средней оценкой зрителей — для главной страницы."""
    community_rating: float | None = None
    votes: int = 0
    watchers: int = 0


class EntryShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: Status
    rating: int | None
    review: str | None
    watched_at: date | None
    is_favorite: bool
    created_at: datetime | None = None


class MovieDetailOut(MovieOut):
    community_rating: float | None = None
    watchers: int = 0
    my_entry: EntryShort | None = None


class ReviewOut(BaseModel):
    user_name: str
    login: str
    avatar_color: str
    rating: int | None
    review: str
    watched_at: date | None


class SearchItem(BaseModel):
    source: str
    external_id: str
    title: str
    original_title: str | None = None
    year: int | None = None
    poster_url: str | None = None
    overview: str | None = None
    local_id: int | None = None
    imdb_id: str | None = None
    my_status: Status | None = None

    @field_serializer("poster_url")
    def poster_address(self, value: str | None) -> str | None:
        if self.local_id and not (value or "").startswith("/"):
            return for_movie_url(self.local_id, value, self.imdb_id)
        return proxied(value, self.imdb_id)


class SearchOut(BaseModel):
    query: str
    provider: str | None
    items: list[SearchItem]
    warnings: list[str] = []


class ImportIn(BaseModel):
    source: Literal["tmdb", "poiskkino", "omdb", "wikipedia", "itunes"]
    external_id: str = Field(min_length=1, max_length=120)


class ProviderStatus(BaseModel):
    name: str
    title: str
    configured: bool
    requires_key: bool
    free_limit: str


# ---------- Дневник просмотров ----------

class EntryIn(BaseModel):
    movie_id: int
    status: Status = "watched"
    rating: int | None = Field(default=None, ge=1, le=10)
    review: str | None = Field(default=None, max_length=2000)
    watched_at: date | None = None
    is_favorite: bool = False

    @model_validator(mode="after")
    def check_dates(self):
        if self.watched_at and self.watched_at > date.today():
            raise ValueError("Дата просмотра не может быть в будущем")
        if self.status != "watched":
            self.watched_at = None
        elif self.watched_at is None:
            self.watched_at = date.today()
        return self


class EntryUpdate(BaseModel):
    status: Status | None = None
    rating: int | None = Field(default=None, ge=1, le=10)
    review: str | None = Field(default=None, max_length=2000)
    watched_at: date | None = None
    is_favorite: bool | None = None


class EntryOut(EntryShort):
    created_at: datetime
    updated_at: datetime
    movie: MovieOut


# ---------- Статистика ----------

class LabelValue(BaseModel):
    label: str
    value: float


class StatsOut(BaseModel):
    watched: int
    planned: int
    dropped: int
    favorites: int
    minutes: int
    avg_rating: float | None
    reviews: int
    by_month: list[LabelValue]
    by_genre: list[LabelValue]
    by_decade: list[LabelValue]
    rating_distribution: list[LabelValue]
    top_rated: list[EntryOut]


class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    query: str
    provider: str | None
    results_count: int
    searched_at: datetime


# ---------- Администрирование ----------

class AdminUserOut(UserOut):
    entries_count: int = 0
    last_login_at: datetime | None = None


class AdminStatsOut(BaseModel):
    users: int
    movies: int
    entries: int
    searches: int
    deleted: int
    cache_items: int


class DeleteUserIn(BaseModel):
    reason: str = Field(min_length=5, max_length=255)


class DeletedLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    login: str
    email: str
    reason: str
    deleted_by: str
    deleted_at: datetime
