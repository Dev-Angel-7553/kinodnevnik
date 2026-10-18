import { Link } from 'react-router-dom';
import { quickClick, useQuickView } from '../context/QuickView';
import { SOURCES, STATUSES } from '../utils';
import Poster from './Poster';

export function StatusBadge({ status }) {
  if (!status) return null;
  const s = STATUSES[status];
  return (
    <span className="badge status-badge" style={{ '--status': s.color }}>
      {s.short}
    </span>
  );
}

const one = value => Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Рейтинг кинобазы для карточки: Кинопоиск, если известен, иначе IMDb или TMDB
export function externalScore(movie) {
  if (movie.rating_kp) return { label: 'КП', value: one(movie.rating_kp), title: 'Рейтинг Кинопоиска' };
  if (movie.rating_imdb) return { label: 'IMDb', value: one(movie.rating_imdb), title: 'Рейтинг IMDb' };
  if (movie.rating_tmdb) return { label: 'TMDB', value: one(movie.rating_tmdb), title: 'Рейтинг TMDB' };
  return null;
}

// Карточка фильма в сетке: постер, название, год и жанры, рейтинг кинобазы и отметки пользователя
export default function MovieCard({ movie, to, onClick, status, rating, ratingTitle = 'Моя оценка', favorite, source, busy = false }) {
  const meta = [movie.year, movie.genres?.slice(0, 2).join(', ')].filter(Boolean).join(', ');
  const ext = externalScore(movie);
  const quick = useQuickView();
  const content = (
    <>
      <div className="movie-card__poster">
        <Poster src={movie.poster_url} title={movie.title} year={movie.year} />
        <div className="movie-card__badges">
          <StatusBadge status={status} />
          {favorite && (
            <span className="badge fav-badge" title="В избранном">
              ♥
            </span>
          )}
          {source && <span className="badge source-badge">{SOURCES[source] ?? source}</span>}
        </div>
        {ext && (
          <span className="badge movie-card__score" title={ext.title}>
            <small>{ext.label}</small>
            {ext.value}
          </span>
        )}
        {rating ? (
          <span className="badge movie-card__mark" title={ratingTitle}>
            ★ {rating}
          </span>
        ) : null}
        {busy && <span className="movie-card__busy">Открываем…</span>}
      </div>
      <div className="movie-card__body">
        <h3 className="movie-card__title">{movie.title}</h3>
        <p className="movie-card__meta">{meta || movie.original_title}</p>
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="movie-card" onClick={quickClick(quick, movie)}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className="movie-card" onClick={onClick} disabled={busy}>
      {content}
    </button>
  );
}
