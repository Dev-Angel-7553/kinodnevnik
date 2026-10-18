"""ORM-модели: девять таблиц базы данных kinodnevnik."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, Float, ForeignKey,
    Integer, String, Table, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

STATUSES = ("watched", "planned", "dropped")

# Связующая таблица «многие ко многим» между фильмами и жанрами
movie_genres = Table(
    "movie_genres",
    Base.metadata,
    Column("movie_id", ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True),
    Column("genre_id", ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(50))

    users: Mapped[list["User"]] = relationship(back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    last_name: Mapped[str] = mapped_column(String(50))
    first_name: Mapped[str] = mapped_column(String(50))
    middle_name: Mapped[str | None] = mapped_column(String(50))
    login: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    avatar_color: Mapped[str] = mapped_column(String(7), default="#e3c567")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    role: Mapped[Role] = relationship(back_populates="users", lazy="joined")
    entries: Mapped[list["UserMovie"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    searches: Mapped[list["SearchHistory"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class Genre(Base):
    __tablename__ = "genres"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)


class Movie(Base):
    __tablename__ = "movies"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_movie_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    original_title: Mapped[str | None] = mapped_column(String(255))
    year: Mapped[int | None] = mapped_column(Integer)
    runtime: Mapped[int | None] = mapped_column(Integer)  # минуты
    overview: Mapped[str | None] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(String(500))
    country: Mapped[str | None] = mapped_column(String(120))
    director: Mapped[str | None] = mapped_column(String(160))
    source: Mapped[str] = mapped_column(String(20))        # tmdb | poiskkino | omdb | itunes | demo
    external_id: Mapped[str] = mapped_column(String(120))
    imdb_id: Mapped[str | None] = mapped_column(String(20))
    rating_imdb: Mapped[float | None] = mapped_column(Float)
    rating_kp: Mapped[float | None] = mapped_column(Float)
    rating_tmdb: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    genres: Mapped[list[Genre]] = relationship(secondary=movie_genres, lazy="selectin")
    entries: Mapped[list["UserMovie"]] = relationship(
        back_populates="movie", cascade="all, delete-orphan", passive_deletes=True
    )


class UserMovie(Base):
    """Запись дневника: фильм в списке пользователя."""
    __tablename__ = "user_movies"
    __table_args__ = (
        UniqueConstraint("user_id", "movie_id", name="uq_user_movie"),
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 10", name="ck_rating_range"),
        CheckConstraint("status IN ('watched', 'planned', 'dropped')", name="ck_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(10), default="watched")
    rating: Mapped[int | None] = mapped_column(Integer)
    review: Mapped[str | None] = mapped_column(Text)
    watched_at: Mapped[date | None] = mapped_column(Date)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="entries")
    movie: Mapped[Movie] = relationship(back_populates="entries", lazy="joined")


class SearchHistory(Base):
    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    query: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str | None] = mapped_column(String(20))
    results_count: Mapped[int] = mapped_column(Integer, default=0)
    searched_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped[User] = relationship(back_populates="searches")


class ApiCache(Base):
    """Кэш ответов внешних API — экономит суточные лимиты бесплатных тарифов."""
    __tablename__ = "api_cache"
    __table_args__ = (UniqueConstraint("provider", "cache_key", name="uq_cache_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(20))
    cache_key: Mapped[str] = mapped_column(String(255))
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class DeletedUserLog(Base):
    __tablename__ = "deleted_users_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    login: Mapped[str] = mapped_column(String(32))
    email: Mapped[str] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(String(255))
    deleted_by: Mapped[str] = mapped_column(String(32))
    deleted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
