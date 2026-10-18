import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

import { API } from '../api/client';
import Poster from '../components/Poster';
import { setAmbient } from '../ambient';
import { loadPalette } from '../posterPalette';
import { formatRuntime, STATUSES } from '../utils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

// Мини-окно фильма: по клику на карточку фон размывается, постер «вылетает» из карточки
// и становится частью окна с фактами, рейтингами и описанием; при закрытии улетает обратно.

const QuickViewContext = createContext(null);

export const useQuickView = () => useContext(QuickViewContext);

const one = v => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SPRING = { type: 'spring', stiffness: 230, damping: 27, mass: 0.9 };

// Смещение и масштаб, которые переносят элемент «to» на место элемента «from»
function delta(from, to) {
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, scale: a.width / b.width };
}

function visible(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

function QuickViewPanel({ movie: initial, from, onClosed }) {
  const { user } = useAuth();
  const notify = useToast();
  const reduce = useReducedMotion();
  const [movie, setMovie] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState(from && !reduce ? 'flying' : 'open'); // flying → open → closing
  const posterRef = useRef(null);
  const closeRef = useRef(null);
  const flies = Boolean(from) && !reduce;

  // Полёт постера из карточки в окно (FLIP: начинаем на месте карточки и пружиной едем на своё)
  useLayoutEffect(() => {
    if (!flies || !posterRef.current) return;
    const d = delta(from, posterRef.current);
    from.style.visibility = 'hidden'; // в карточке постера «нет» — он в окне
    animate(posterRef.current, { x: [d.x, 0], y: [d.y, 0], scale: [d.scale, 1] }, SPRING).then(() => setPhase('open'));
  }, [flies, from]);

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

  // Фон страницы подсвечивается цветами постера, пока окно открыто
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

  const close = useCallback(async () => {
    if (phase === 'closing') return;
    setPhase('closing');
    if (flies && visible(from) && posterRef.current) {
      const d = delta(from, posterRef.current);
      await animate(posterRef.current, { x: d.x, y: d.y, scale: d.scale }, { duration: 0.38, ease: [0.4, 0, 0.2, 1] });
    } else {
      await new Promise(r => setTimeout(r, 180));
    }
    if (from) from.style.visibility = '';
    onClosed();
  }, [phase, flies, from, onClosed]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (from) from.style.visibility = '';
      previous?.focus?.({ preventScroll: true });
    };
  }, [from]);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

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

  return (
    <div className={`qv qv--${phase}`} role="dialog" aria-modal="true" aria-labelledby="qv-title">
      <motion.div
        className="qv__backdrop"
        onClick={close}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'closing' ? 0 : 1 }}
        transition={{ duration: phase === 'closing' ? 0.3 : 0.35 }}
      />
      <motion.article
        className="qv__panel"
        initial={flies ? false : reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
        animate={phase === 'closing' && !flies ? { opacity: 0, y: 12 } : { opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
      >
        <button ref={closeRef} type="button" className="qv__close icon-btn" onClick={close} aria-label="Закрыть">
          ×
        </button>
        <div className="qv__poster" ref={posterRef}>
          {movie.poster_url && <img className="qv__glow" src={movie.poster_url} alt="" aria-hidden="true" />}
          <Poster src={movie.poster_url} title={movie.title} year={movie.year} />
        </div>
        <motion.div
          className="qv__info"
          initial={reduce ? false : { opacity: 0, x: 22 }}
          animate={phase === 'closing' ? { opacity: 0, x: 12 } : { opacity: 1, x: 0 }}
          transition={{ duration: phase === 'closing' ? 0.18 : 0.45, delay: phase === 'closing' ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
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
            <Link to={`/movie/${movie.id}`} className="btn btn-accent">
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
        </motion.div>
      </motion.article>
    </div>
  );
}

export function QuickViewProvider({ children }) {
  const [state, setState] = useState(null);
  const { pathname } = useLocation();
  const open = useCallback((movie, from = null) => setState({ movie, from }), []);
  const closed = useCallback(() => setState(null), []);

  useEffect(() => setState(null), [pathname]); // переход на другую страницу закрывает окно сразу

  const value = useMemo(() => ({ open }), [open]);
  return (
    <QuickViewContext.Provider value={value}>
      {children}
      {createPortal(
        <AnimatePresence>
          {state && <QuickViewPanel key={state.movie.id} movie={state.movie} from={state.from} onClosed={closed} />}
        </AnimatePresence>,
        document.body
      )}
    </QuickViewContext.Provider>
  );
}

// Обработчик клика по ссылке на фильм: обычный клик открывает мини-окно (постер вылетает из
// элемента с классом .poster внутри ссылки), клик с Ctrl/Cmd/Shift — обычная ссылка
export function quickClick(quick, movie) {
  return e => {
    if (!quick || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    quick.open(movie, el.querySelector('.movie-card__poster') || el.querySelector('.poster'));
  };
}
