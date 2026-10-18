import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { API } from '../api/client';
import Avatar from '../components/Avatar';
import Loader from '../components/Loader';
import BlurText from '../components/reactbits/BlurText/BlurText';
import HoldButton from '../components/reactbits/HoldButton/HoldButton';
import PeekRating from '../components/reactbits/PeekRating/PeekRating';
import PulseHeart from '../components/reactbits/PulseHeart/PulseHeart';
import RubberSegment from '../components/reactbits/RubberSegment/RubberSegment';
import TearTicket from '../components/reactbits/TearTicket/TearTicket';
import TiltedCard from '../components/reactbits/TiltedCard/TiltedCard';
import Poster from '../components/Poster';
import { EmptyState, Notice } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import usePosterColor from '../usePosterColor';
import { useToast } from '../context/ToastContext';
import { formatDate, formatRuntime, plural, SOURCES, STATUSES, todayISO } from '../utils';

const RATING_LABELS = ['Ужасно', 'Очень плохо', 'Плохо', 'Слабо', 'Средне', 'Неплохо', 'Хорошо', 'Отлично', 'Великолепно', 'Шедевр'];

const emptyForm = { status: 'watched', rating: 0, review: '', watched_at: todayISO(), is_favorite: false };

const daysAgo = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));

// Билет на фильм из списка «Буду смотреть»: оторванный корешок отмечает фильм просмотренным
function WatchTicket({ movie, addedAt, onTear }) {
  const added = addedAt ? daysAgo(addedAt) : null;
  return (
    <div className="watch-ticket">
      <TearTicket
        width={460}
        height={196}
        stubSize={136}
        radius={10}
        holes={9}
        holeSize={6}
        rotate={-1.5}
        tiltMax={5}
        parallax={3}
        background="#202226"
        stubBackground="#26282d"
        color="#ecebe8"
        borderColor="#33353b"
        onTear={onTear}
        ariaLabel={`Оторвать корешок: отметить «${movie.title}» просмотренным`}
        stub={
          <div className="watch-ticket__stub">
            <b>Посмотрели?</b>
            <span>Потяните корешок вниз, чтобы оторвать</span>
          </div>
        }
      >
        <div className="watch-ticket__body">
          <Poster src={movie.poster_url} title={movie.title} year={movie.year} />
          <div>
            <span className="watch-ticket__label">Билет на вечер</span>
            <b className="watch-ticket__title">{movie.title}</b>
            <span className="watch-ticket__meta">{[movie.year, formatRuntime(movie.runtime)].filter(Boolean).join(', ')}</span>
            {added !== null && (
              <span className="watch-ticket__meta">
                {added === 0 ? 'В списке с сегодняшнего дня' : `В списке ${added} ${plural(added, 'день', 'дня', 'дней')}`}
              </span>
            )}
          </div>
        </div>
      </TearTicket>
      <p className="watch-ticket__hint">
        Когда посмотрите фильм, оторвите корешок: он отметится просмотренным с сегодняшней датой, а вы сразу сможете
        поставить оценку.
      </p>
    </div>
  );
}

export default function MoviePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();

  const [movie, setMovie] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const posterColor = usePosterColor(movie?.poster_url);
  const [poster, setPoster] = useState({ w: 300, h: 450 });
  const [posterOk, setPosterOk] = useState(null);

  // Проверяем, загружается ли постер: если нет — показываем обложку-заглушку
  useEffect(() => {
    setPosterOk(null);
    if (!movie?.poster_url) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setPosterOk(true);
    img.onerror = () => alive && setPosterOk(false);
    img.src = movie.poster_url;
    return () => {
      alive = false;
    };
  }, [movie?.poster_url]);

  // Размер постера под ширину экрана: на планшете и телефоне он меньше
  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth;
      const w = vw < 640 ? Math.min(240, vw - 64) : vw <= 900 ? 220 : 300;
      setPoster({ w, h: Math.round(w * 1.5) });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const load = useCallback(() => {
    API.movie(id)
      .then(data => {
        setMovie(data);
        const e = data.my_entry;
        setForm(
          e
            ? { status: e.status, rating: e.rating || 0, review: e.review || '', watched_at: e.watched_at || todayISO(), is_favorite: e.is_favorite }
            : emptyForm
        );
      })
      .catch(err => setError(err.message));
    API.reviews(id).then(setReviews).catch(() => {});
  }, [id]);

  useEffect(load, [load]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await API.saveEntry({
        movie_id: movie.id,
        status: form.status,
        rating: form.status === 'planned' || !form.rating ? null : form.rating,
        review: form.review.trim() || null,
        watched_at: form.status === 'watched' ? form.watched_at : null,
        is_favorite: form.is_favorite,
      });
      notify(movie.my_entry ? 'Запись обновлена' : 'Фильм добавлен в дневник', {
        description: `«${movie.title}» — ${STATUSES[form.status].label.toLowerCase()}`,
      });
      load();
    } catch (err) {
      notify('Не удалось сохранить', { tone: 'error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await API.deleteEntry(movie.my_entry.id);
    notify('Фильм удалён из дневника', { tone: 'info' });
    load();
  };

  // Корешок билета оторван: фильм из «Буду смотреть» становится просмотренным сегодня
  const markWatched = async () => {
    try {
      await API.saveEntry({
        movie_id: movie.id,
        status: 'watched',
        rating: null,
        review: form.review.trim() || null,
        watched_at: todayISO(),
        is_favorite: form.is_favorite,
      });
      notify('Отмечено как просмотренное', { description: 'Поставьте оценку, пока впечатление свежее' });
      load();
    } catch (err) {
      notify('Не удалось сохранить', { tone: 'error', description: err.message });
    }
  };

  if (error) {
    return (
      <div className="container page">
        <EmptyState title="Фильм не найден" action={<Link className="btn btn-ghost" to="/search">К поиску</Link>}>
          {error}
        </EmptyState>
      </div>
    );
  }
  if (!movie) return <Loader />;

  const ratings = [
    ['IMDb', movie.rating_imdb],
    ['Кинопоиск', movie.rating_kp],
    ['TMDB', movie.rating_tmdb],
    ['КиноДневник', movie.community_rating],
  ].filter(([, v]) => v);

  return (
    <div className="container page movie-page" style={posterColor ? { '--movie-accent': posterColor } : undefined}>
      <div className="movie-hero">
        <div className="movie-hero__poster">
          {movie.poster_url && posterOk !== false ? (
            <TiltedCard
              imageSrc={movie.poster_url}
              altText={`Постер фильма «${movie.title}»`}
              containerHeight={`${poster.h}px`}
              containerWidth={`${poster.w}px`}
              imageHeight={`${poster.h}px`}
              imageWidth={`${poster.w}px`}
              rotateAmplitude={7}
              scaleOnHover={1.02}
              showTooltip={false}
              flipOnClick={false}
              radius={6}
              glare={0}
            />
          ) : (
            <Poster title={movie.title} year={movie.year} className="poster--large" />
          )}
        </div>

        <div className="movie-hero__info">
          <BlurText text={movie.title} tag="h1" className="movie-title" delay={50} animateBy="words" />
          {movie.original_title && movie.original_title !== movie.title && (
            <p className="movie-original">{movie.original_title}</p>
          )}
          <div className="movie-tags">
            {movie.genres.map(g => (
              <span key={g} className="tag">
                {g}
              </span>
            ))}
            <span className="tag">Источник: {SOURCES[movie.source]}</span>
          </div>

          <dl className="movie-facts">
            {[
              ['Год', movie.year],
              ['Страна', movie.country],
              ['Режиссёр', movie.director],
              ['Длительность', formatRuntime(movie.runtime)],
              ['Смотрели', movie.watchers ? `${movie.watchers} чел.` : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>

          {ratings.length > 0 && (
            <div className="rating-row">
              {ratings.map(([label, value]) => (
                <div key={label} className="rating-pill">
                  <b>{Number(value).toFixed(1)}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          )}

          {movie.overview && <p className="movie-overview">{movie.overview}</p>}
        </div>
      </div>

      <section className="diary-panel">
        <div className="diary-panel__head">
          <h2>Мой дневник</h2>
          {movie.my_entry && (
            <span className="diary-panel__saved" style={{ '--status': STATUSES[movie.my_entry.status].color }}>
              Сохранено: {STATUSES[movie.my_entry.status].label.toLowerCase()}
            </span>
          )}
        </div>

        {!user ? (
          <Notice tone="info">
            <Link to="/login" state={{ from: `/movie/${movie.id}` }}>Войдите</Link>, чтобы отметить фильм, поставить
            оценку и написать рецензию.
          </Notice>
        ) : (
          <div className="diary-form">
            {movie.my_entry?.status === 'planned' && (
              <WatchTicket movie={movie} addedAt={movie.my_entry.created_at} onTear={markWatched} />
            )}
            <RubberSegment
              items={Object.entries(STATUSES).map(([value, s]) => ({ value, label: s.label }))}
              value={form.status}
              onChange={value => set('status', value)}
              trackColor="#202226"
              thumbColor={STATUSES[form.status].color}
              textColor="#a1a3a8"
              activeTextColor="#111214"
              size="lg"
              radius={10}
              aria-label="Статус"
            />

            {form.status !== 'planned' && (
              <div className="diary-form__row">
                <div className="diary-form__rating">
                  <span className="field__label">Моя оценка: {form.rating ? `${form.rating} из 10` : 'нет'}</span>
                  <PeekRating
                    value={form.rating}
                    onChange={value => set('rating', value)}
                    count={10}
                    size={24}
                    labels={RATING_LABELS}
                    activeColor="#f5c518"
                    idleColor="rgba(255,255,255,0.18)"
                    tipColor="#2a2c31"
                    ariaLabel="Оценка фильма"
                  />
                </div>
                {form.status === 'watched' && (
                  <label className="field field--inline">
                    <span className="field__label">Дата просмотра</span>
                    <input
                      type="date"
                      value={form.watched_at}
                      max={todayISO()}
                      onChange={e => set('watched_at', e.target.value)}
                    />
                  </label>
                )}
                <div className="diary-form__fav">
                  <span className="field__label">Избранное</span>
                  <PulseHeart
                    liked={form.is_favorite}
                    onChange={value => set('is_favorite', value)}
                    showCount={false}
                    size={38}
                    pillColor="#24262b"
                    likedColor="#ef4f5f"
                  />
                </div>
              </div>
            )}

            <label className="field">
              <span className="field__label">Рецензия</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={form.review}
                onChange={e => set('review', e.target.value)}
                placeholder="Пара предложений о впечатлениях — для себя и других зрителей"
              />
            </label>

            <div className="diary-form__actions">
              <button type="button" className="btn btn-accent" onClick={save} disabled={saving}>
                {saving ? 'Сохраняем…' : movie.my_entry ? 'Сохранить изменения' : 'Добавить в дневник'}
              </button>
              {movie.my_entry && (
                <HoldButton
                  className="hold-danger"
                  holdTime={1100}
                  backgroundColor="transparent"
                  fillColor="#ef4f5f"
                  textColor="#ef4f5f"
                  fillTextColor="#111214"
                  radius={8}
                  glow={false}
                  doneLabel="Удалено"
                  onHold={remove}
                  onTap={() => notify('Удерживайте кнопку', { tone: 'info', description: 'Фильм удалится, когда кнопка заполнится' })}
                >
                  Удерживайте, чтобы удалить
                </HoldButton>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                Назад
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="section reviews-section">
        <h2 className="section-title">Рецензии зрителей</h2>
        {reviews.length === 0 ? (
          <p className="muted">Пока никто не написал рецензию. Станьте первым!</p>
        ) : (
          <div className="review-list">
            {reviews.map((r, i) => (
              <article key={i} className="review">
                <Avatar user={{ first_name: r.user_name, last_name: r.user_name.split(' ')[1], avatar_color: r.avatar_color }} size={36} />
                <div>
                  <header>
                    <b>{r.user_name}</b>
                    {r.rating && <span className="review__mark">★ {r.rating}</span>}
                    <time>{formatDate(r.watched_at)}</time>
                  </header>
                  <p>{r.review}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
