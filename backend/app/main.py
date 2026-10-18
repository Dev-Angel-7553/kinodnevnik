"""Точка входа серверной части «КиноДневник».

Запуск: uvicorn app.main:app --reload
Документация API: http://localhost:8000/docs
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import BASE_DIR, settings
from .routers import admin, auth, library, movies, posters, stats, users
from .seed import init_db
from .services.enrich import enrich_in_background

FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

# Понятные сообщения для типовых ошибок проверки данных
MESSAGES = {
    "missing": "Обязательное поле",
    "string_too_short": "Слишком короткое значение",
    "string_too_long": "Слишком длинное значение",
    "greater_than_equal": "Значение меньше допустимого",
    "less_than_equal": "Значение больше допустимого",
    "literal_error": "Недопустимое значение",
    "int_parsing": "Ожидается целое число",
    "date_from_datetime_parsing": "Неверный формат даты",
    "string_pattern_mismatch": "Неверный формат",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()  # создаёт таблицы и заполняет базу при первом запуске
    enrich_in_background()  # рейтинги Кинопоиска и TMDB для каталога, если заданы ключи
    yield


app = FastAPI(
    title="КиноДневник API",
    version="1.0.0",
    description="REST API веб-приложения для учёта просмотренных фильмов.",
    lifespan=lifespan,
    docs_url=None,  # документация подключается ниже из локальных файлов — работает без интернета
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError):
    """Превращает ошибки Pydantic в словарь «поле → сообщение» для формы на клиенте."""
    fields = {}
    for error in exc.errors():
        loc = [str(part) for part in error["loc"] if part not in ("body", "query", "path")]
        field = loc[-1] if loc else "password_confirm"  # ошибка уровня модели — несовпадение паролей
        message = error.get("msg", "")
        if error["type"] == "value_error":
            message = message.removeprefix("Value error, ")
            if "email" in message.lower() and field == "email":
                message = "Некорректный адрес email"
        else:
            message = MESSAGES.get(error["type"], message)
        fields.setdefault(field, message)
    return JSONResponse(status_code=422,
                        content={"detail": {"message": "Проверьте правильность заполнения", "fields": fields}})


for module in (auth, movies, posters, library, stats, users, admin):
    app.include_router(module.router)

app.mount("/posters", StaticFiles(directory=BASE_DIR / "static" / "posters"), name="posters")
app.mount("/swagger", StaticFiles(directory=BASE_DIR / "static" / "swagger"), name="swagger")


@app.get("/docs", include_in_schema=False)
def docs():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="КиноДневник API — документация",
        swagger_js_url="/swagger/swagger-ui-bundle.js",
        swagger_css_url="/swagger/swagger-ui.css",
        swagger_favicon_url="/favicon.svg",
    )


@app.get("/api/health", tags=["Служебное"])
def health():
    return {"status": "ok", "app": settings.app_name}


# Собранный клиент (npm run build) раздаётся тем же сервером
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = FRONTEND_DIST / path
        if path and file.is_file() and FRONTEND_DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
