# КиноДневник — веб-приложение для учёта просмотренных фильмов

Курсовая работа по МДК 09.01 «Проектирование и разработка веб-приложений».

**Клиент:** React 19 + Vite, 20 компонентов [React Bits](https://reactbits.dev/) (PillNav, Dock, LogoLoop,
DriftWall, TiltedCard, RubberSegment, PeekRating, TearTicket, HoldButton, ClickSpark, Counter, Stepper и др.),
React Router, Recharts. Мини-окно фильма по клику на карточку, фон в цветах постера открытого фильма.
**Сервер:** Python, FastAPI, SQLAlchemy 2, SQLite (или PostgreSQL), JWT + bcrypt.
**Данные о фильмах:** TMDB, ПоискКино (Кинопоиск), OMDb, Википедия, iTunes Search API — с кэшированием
и автоматическим переключением, если один из источников недоступен. Википедия и iTunes работают без ключей.

## Запуск одной командой

Нужны Python 3.11+ и Node.js 20+.

```bash
npm start          # или двойной щелчок по start.bat (Windows), ./start.sh (Linux/macOS)
```

При первом запуске скрипт `run.mjs` сам создаст `backend/.venv`, установит зависимости сервера
и клиента, затем запустит оба сервиса в одном окне:

- приложение — http://localhost:5173 (с телефона в той же Wi-Fi сети — адрес «Network» из строк `[web]`);
- API и документация — http://localhost:8000/docs.

Остановка — Ctrl+C (останавливаются оба процесса). База данных `backend/kinodnevnik.db`
создаётся и заполняется при первом запуске.

## Другие команды (в корне проекта)

```bash
npm run setup      # только установить зависимости
npm test           # 22 автотеста сервера (pytest)
npm run reset-db   # пересоздать базу с демонстрационными данными
npm run build      # собрать клиент в frontend/dist — тогда всё приложение открывается на :8000
```

## Демо-учётные записи

| Роль | Логин | Пароль |
|---|---|---|
| Администратор | admin | admin2026 |
| Пользователь с заполненным дневником | demo | demo2026 |
| Другие пользователи | petrov_k, anna_v, dmitry88, lena_kino, maxim_t | kino2026 |

## Ключи внешних API (необязательно)

Без ключей поиск работает через Википедию, iTunes Search API и локальный каталог из 50 фильмов.
Ключи добавляют русские данные Кинопоиска, рейтинги и постеры. Скопируйте `backend/.env.example`
в `backend/.env`, впишите ключи и перезапустите `npm start`.

| Переменная | Что даёт | Где получить | Лимит |
|---|---|---|---|
| `POISKKINO_API_KEY` | данные и рейтинг Кинопоиска, постеры (работают в России) | Telegram-бот [@poiskkinodev_bot](https://t.me/poiskkinodev_bot), сайт [poiskkino.dev](https://poiskkino.dev/) | 200 запросов в сутки |
| `TMDB_API_KEY` | русские описания, постеры, рейтинг TMDB | [themoviedb.org](https://www.themoviedb.org/settings/api): регистрация → Настройки → API → создать ключ (Developer); подойдёт API Key или API Read Access Token | ≈40 запросов в секунду |
| `OMDB_API_KEY` | рейтинг IMDb | [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx): тариф FREE, ключ приходит на почту, его нужно активировать по ссылке из письма | 1000 запросов в сутки |

После запуска с ключами сервер в фоне дополняет каталог рейтингами Кинопоиска и TMDB; вручную —
кнопка «Обновить рейтинги» в админ-панели. Если постер из одной кинобазы не открывается
(например, картинки TMDB недоступны у провайдера), сервер сам ищет постер этого фильма в других
источниках и запоминает его.

## Публикация на Vercel

В корне лежат `vercel.json`, `api/index.py` и `requirements.txt`: клиент собирается Vite и раздаётся
как статика, сервер FastAPI работает как Python-функция. Импортируйте репозиторий на vercel.com
(настройки берутся из `vercel.json`) и задайте переменные окружения в Settings → Environment Variables:
`SECRET_KEY` (случайная строка), при желании — ключи API из таблицы выше.

По умолчанию база SQLite создаётся во временной папке функции и заполняется демо-данными, поэтому
изменения со временем сбрасываются. Для постоянного хранения подключите бесплатный PostgreSQL
(например, Neon в разделе Storage) и задайте `DATABASE_URL` — адрес вида `postgres://…` подходит как есть.

## Структура

```
run.mjs, start.bat, start.sh   запуск сервера и клиента одной командой
vercel.json, api/index.py      публикация на Vercel
backend/   app/ (main, models, schemas, security, routers/, providers/), tests/, static/, data/
frontend/  src/ (pages/, components/, components/reactbits/, api/, context/, styles/)
```

Компоненты React Bits распространяются по лицензии MIT + Commons Clause
(см. `frontend/src/components/reactbits/LICENSE.md`).
Постеры демонстрационного каталога — настоящие постеры фильмов (`backend/static/posters`,
имена файлов — IMDb ID); они хранятся локально, поэтому демо работает без интернета.
Постеры фильмов, найденных во внешних API, сервер один раз скачивает и хранит в
`backend/static/posters/cache` (адрес вида `/api/posters?url=…`), поэтому они открываются и повторно без обращения к источнику.
