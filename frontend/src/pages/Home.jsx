import { HugeiconsIcon } from '@hugeicons/react';
import { Analytics01Icon, BookOpen01Icon, Database01Icon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { API } from '../api/client';
import MovieCard from '../components/MovieCard';
import Poster from '../components/Poster';
import LogoLoop from '../components/reactbits/LogoLoop/LogoLoop';
import SplitText from '../components/reactbits/SplitText/SplitText';
import { useAuth } from '../context/AuthContext';
import { quickClick, useQuickView } from '../context/QuickView';
import { formatDate } from '../utils';

// Корешок билета: последний просмотренный фильм пользователя или самый обсуждаемый фильм для гостя
function Ticket({ label, movie, date, mark, markNote, review }) {
  return (
    <Link to={`/movie/${movie.id}`} className="ticket">
      <Poster src={movie.poster_url} title={movie.title} year={movie.year} />
      <div>
        <span className="ticket__label">{label}</span>
        <h2 className="ticket__title">{movie.title}</h2>
        <p className="ticket__meta">{[movie.year, date].filter(Boolean).join(', ')}</p>
        {mark ? (
          <span className="ticket__mark">
            ★ {mark}
            {markNote && <small>{markNote}</small>}
          </span>
        ) : null}
        {review && <p className="ticket__review">«{review.length > 150 ? `${review.slice(0, 150).trim()}…` : review}»</p>}
      </div>
    </Link>
  );
}

const score = value => (value ? value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null);

// Элемент ленты: постер со ссылкой и оценкой; щелчок открывает мини-окно фильма
const ribbonItem = (movie, mark, note, quick) => ({
  ariaLabel: movie.title,
  node: (
    <Link to={`/movie/${movie.id}`} className="ribbon-item" draggable={false} onClick={quickClick(quick, movie)}>
      <Poster src={movie.poster_url} title={movie.title} year={movie.year} />
      {mark ? (
        <span className="ribbon-item__mark">
          ★ {mark}
          {note && <span>{note}</span>}
        </span>
      ) : null}
    </Link>
  ),
});

export default function Home() {
  const { user } = useAuth();
  const quick = useQuickView();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [popular, setPopular] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [recent, setRecent] = useState([]);
  const [planned, setPlanned] = useState([]);
  const [guestReview, setGuestReview] = useState(null);

  useEffect(() => {
    API.catalog({ sort: 'popular', limit: 16 }).then(setPopular).catch(() => {});
    API.catalog({ sort: 'rating', limit: 6 }).then(setTopRated).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setRecent([]);
      setPlanned([]);
      return;
    }
    API.library({ status: 'watched', sort: 'watched' }).then(setRecent).catch(() => {});
    API.library({ status: 'planned', sort: 'recent' }).then(setPlanned).catch(() => {});
  }, [user]);

  // Для гостя на билете — популярный фильм, о котором уже написали рецензию
  useEffect(() => {
    if (user || !popular.length) return undefined;
    let alive = true;
    (async () => {
      for (const movie of popular.slice(0, 6)) {
        const list = await API.reviews(movie.id).catch(() => []);
        if (list.length) {
          if (alive) setGuestReview({ movie, ...list[0] });
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, popular]);

  const submit = e => {
    e.preventDefault();
    if (query.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const last = recent[0];
  // Лента запоминается, чтобы ввод в строку поиска не перезапускал её движение
  const ribbon = useMemo(
    () =>
      user && recent.length >= 6
        ? recent.slice(0, 16).map(e => ribbonItem(e.movie, e.rating, null, quick))
        : popular.map(m => ribbonItem(m, score(m.community_rating), null, quick)),
    [user, recent, popular, quick]
  );
  const topIds = new Set(topRated.map(m => m.id));

  return (
    <div className="container">
      <section className="hero" aria-label="Поиск фильма">
        <div>
          <SplitText
            text={user ? `${user.first_name}, что смотрели вчера?` : 'Дневник просмотренных фильмов'}
            tag="h1"
            className="hero__title"
            splitType="words"
            delay={70}
            duration={0.8}
            textAlign="left"
          />
          <p className="hero__lead">
            {user
              ? 'Найдите фильм, поставьте оценку от 1 до 10 и запишите пару строк, пока впечатление свежее.'
              : 'Отмечайте просмотренное, ставьте оценки, пишите рецензии и держите под рукой список на вечер. Описания и постеры подтягиваются из пяти кинобаз.'}
          </p>
          <form className="search-field" onSubmit={submit} role="search">
            <input
              type="search"
              placeholder="Название фильма или режиссёр"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Название фильма"
            />
            <button type="submit" className="btn btn-accent">
              Найти
            </button>
          </form>
          <div className="hero__links">
            {user ? <Link to="/library">Открыть дневник</Link> : <Link to="/register">Создать дневник</Link>}
            {user ? <Link to="/stats">Моя статистика</Link> : <Link to="/login">Войти</Link>}
          </div>
        </div>

        {user && last ? (
          <Ticket
            label="Последний просмотр"
            movie={last.movie}
            date={formatDate(last.watched_at)}
            mark={last.rating}
            markNote="моя оценка"
            review={last.review}
          />
        ) : !user && guestReview ? (
          <Ticket
            label="Сейчас в дневниках"
            movie={guestReview.movie}
            date={guestReview.movie.director}
            mark={guestReview.rating}
            markNote={`оценка зрителя ${guestReview.user_name}`}
            review={guestReview.review}
          />
        ) : null}
      </section>

      {ribbon.length > 0 && (
        <section className="ribbon" aria-label={user && recent.length >= 6 ? 'Недавно в дневнике' : 'Сейчас в дневниках'}>
          <div className="section-head">
            <h2 className="section-title">{user && recent.length >= 6 ? 'Недавно в дневнике' : 'Сейчас в дневниках'}</h2>
            <Link to={user ? '/library' : '/search'} className="section-link">
              {user ? 'Весь дневник' : 'Найти другие фильмы'}
            </Link>
          </div>
          <LogoLoop
            logos={ribbon}
            speed={28}
            direction="left"
            logoHeight={14}
            gap={18}
            pauseOnHover
            fadeOut
            fadeOutWidth={0.06}
            ariaLabel="Лента постеров"
          />
        </section>
      )}

      <div className="home-columns section">
        {topRated.length > 0 && (
          <section>
            <div className="section-head">
              <div>
                <h2 className="section-title">Высшие оценки</h2>
                <p className="section-lead">Средняя оценка зрителей КиноДневника</p>
              </div>
            </div>
            <div className="movie-grid">
              {topRated.map(m => (
                <MovieCard key={m.id} movie={m} to={`/movie/${m.id}`} rating={score(m.community_rating)} ratingTitle={`Средняя оценка зрителей КиноДневника, голосов: ${m.votes}`} />
              ))}
            </div>
          </section>
        )}

        {user && planned.length > 0 ? (
          <section>
            <div className="section-head">
              <div>
                <h2 className="section-title">Буду смотреть</h2>
                <p className="section-lead">Ваш список на ближайшие вечера</p>
              </div>
              <Link to="/library" className="section-link">
                Все {planned.length}
              </Link>
            </div>
            <div className="movie-grid">
              {planned.slice(0, 6).map(e => (
                <MovieCard key={e.id} movie={e.movie} to={`/movie/${e.movie.id}`} />
              ))}
            </div>
          </section>
        ) : (
          popular.length > 0 && (
            <section>
              <div className="section-head">
                <div>
                  <h2 className="section-title">Популярное</h2>
                  <p className="section-lead">Фильмы, которые чаще всего добавляют в дневник</p>
                </div>
              </div>
              <div className="movie-grid">
                {popular.filter(m => !topIds.has(m.id)).slice(0, 6).map(m => (
                  <MovieCard key={m.id} movie={m} to={`/movie/${m.id}`} />
                ))}
              </div>
            </section>
          )
        )}
      </div>

      {!user && (
        <section className="section facts-row" aria-label="Возможности">
          <div>
            <h3>
              <HugeiconsIcon icon={BookOpen01Icon} size={20} strokeWidth={1.8} /> Дневник
            </h3>
            <p>Статус, дата просмотра, оценка от 1 до 10, рецензия и отметка «Избранное» для каждого фильма.</p>
          </div>
          <div>
            <h3>
              <HugeiconsIcon icon={Analytics01Icon} size={20} strokeWidth={1.8} /> Статистика
            </h3>
            <p>Часы у экрана, любимые жанры и десятилетия, распределение собственных оценок за год.</p>
          </div>
          <div>
            <h3>
              <HugeiconsIcon icon={Database01Icon} size={20} strokeWidth={1.8} /> Пять кинобаз
            </h3>
            <p>TMDB, Кинопоиск, OMDb, Википедия и iTunes. Если одна не отвечает, поиск спросит следующую.</p>
          </div>
        </section>
      )}
      <div className="section" />
    </div>
  );
}
