import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

import { API } from '../api/client';
import Poster from '../components/Poster';
import { setAmbient } from '../ambient';
import { loadPalette } from '../posterPalette';
import { formatRuntime, STATUSES } from '../utils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

// Мини-окно фильма: по клику на карточку фон размывается и выплывает краткая карточка фильма —
// постер, факты, рейтинги, описание и быстрые действия. Полная страница — по кнопке «Открыть фильм».

const QuickViewContext = createContext(null);

export const useQuickView = () => useContext(QuickViewContext);

const one = v => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function QuickViewPanel({ movie: initial, onClose }) {
  const { user } = useAuth();
  const notify = useToast();
  const reduce = useReducedMotion();
  const [movie, setMovie] = useState(initial);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef(null);

  // Полные сведения (оценка зрителей, моя запись) догружаются, пока окно уже открыто
  useEffect(() => {
    let alive = true;
    API.movie(initial.id)
      .then(full => alive && setMovie(m => ({ ...m, ...full })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initial.id]);

  // Фон страницы перекрашивается в цвета постера, пока окно открыто
  useEffect(() => {
    let restore = null;
    let alive = true;
    loadPalette(initial.poster_url).then(p => {
      if (alive && p) restore = setAmbient(p.ambient);
    });
    return () => {
      alive = false;
      restore?.();
    };
  }, [initial.poster_url]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const plan = async () => {
    setSaving(true);
    try {
      const entry = await API.saveEntry({ movie_id: movie.id, status: 'planned', is_favorite: false });
      setMovie(m => ({ ...m, my_entry: entry }));
      notify('Добавлено в «Буду смотреть»', { description: `«${movie.title}»` });
    } catch (err) {
      notify('Не удалось добавить', { tone: 'error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const facts = [movie.year, movie.country, formatRuntime(movie.runtime)].filter(Boolean).join(', ');
  const scores = [
    ['Кинопоиск', movie.rating_kp],
    ['IMDb', movie.rating_imdb],
    ['TMDB', movie.rating_tmdb],
    ['Зрители КиноДневника', movie.community_rating],
  ].filter(([, v]) => v);
  const entry = movie.my_entry;
  const rise = reduce ? {} : { initial: { opacity: 0, y: 28, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 } };

  return (
    <div className="qv" role="dialog" aria-modal="true" aria-labelledby="qv-title">
      <motion.div
        className="qv__backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.article
        className="qv__panel"
        {...rise}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <button ref={closeRef} type="button" className="qv__close icon-btn" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        <motion.div
          className="qv__poster"
          initial={reduce ? false : { opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Poster src={movie.poster_url} title={movie.title} year={movie.year} />
        </motion.div>
        <div className="qv__info">
          <h2 id="qv-title" className="qv__title">
            {movie.title}
          </h2>
          {movie.original_title && movie.original_title !== movie.title && (
            <p className="qv__original">{movie.original_title}</p>
          )}
          {facts && <p className="qv__facts">{facts}</p>}
          {movie.director && <p className="qv__facts">Режиссёр: {movie.director}</p>}
          {movie.genres?.length > 0 && (
            <div className="qv__tags">
              {movie.genres.slice(0, 4).map(g => (
                <span key={g} className="tag">
                  {g}
                </span>
              ))}
            </div>
          )}
          {scores.length > 0 && (
            <dl className="qv__scores">
              {scores.map(([label, value]) => (
                <div key={label}>
                  <dd>{one(value)}</dd>
                  <dt>{label}</dt>
                </div>
              ))}
            </dl>
          )}
          {movie.overview && <p className="qv__overview">{movie.overview}</p>}
          <div className="qv__actions">
            <Link to={`/movie/${movie.id}`} className="btn btn-accent" onClick={onClose}>
              Открыть фильм
            </Link>
            {user && !entry && (
              <button type="button" className="btn" onClick={plan} disabled={saving}>
                {saving ? 'Добавляем…' : 'Буду смотреть'}
              </button>
            )}
            {entry && (
              <span className="qv__status" style={{ '--status': STATUSES[entry.status].color }}>
                В дневнике: {STATUSES[entry.status].label.toLowerCase()}
                {entry.rating ? `, ★ ${entry.rating}` : ''}
              </span>
            )}
          </div>
        </div>
      </motion.article>
    </div>
  );
}

export function QuickViewProvider({ children }) {
  const [movie, setMovie] = useState(null);
  const { pathname } = useLocation();
  const open = useCallback(m => setMovie(m), []);
  const close = useCallback(() => setMovie(null), []);

  useEffect(() => setMovie(null), [pathname]); // переход на другую страницу закрывает окно

  const value = useMemo(() => ({ open, close }), [open, close]);
  return (
    <QuickViewContext.Provider value={value}>
      {children}
      {createPortal(
        <AnimatePresence>{movie && <QuickViewPanel key={movie.id} movie={movie} onClose={close} />}</AnimatePresence>,
        document.body
      )}
    </QuickViewContext.Provider>
  );
}

// Обработчик клика по ссылке на фильм: обычный клик открывает мини-окно,
// а клик с Ctrl/Cmd/Shift или средней кнопкой — как обычная ссылка (новая вкладка)
export function quickClick(quick, movie) {
  return e => {
    if (!quick || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    quick.open(movie);
  };
}
