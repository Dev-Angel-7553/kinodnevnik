import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { API } from '../api/client';
import Avatar from '../components/Avatar';
import Poster from '../components/Poster';
import AnimatedList from '../components/reactbits/AnimatedList/AnimatedList';
import { Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, SOURCES } from '../utils';

const COLORS = ['#e8a87c', '#9cc5a1', '#8fb3e8', '#e3c567', '#c9a3d9', '#d98c8c'];

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    last_name: user.last_name,
    first_name: user.first_name,
    middle_name: user.middle_name || '',
    email: user.email,
    avatar_color: user.avatar_color,
  });
  const [errors, setErrors] = useState({});
  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    API.history().then(setHistory).catch(() => {});
    API.stats().then(setStats).catch(() => {});
    API.library({ favorite: true, sort: 'rating' }).then(setFavorites).catch(() => {});
  }, []);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const save = async e => {
    e.preventDefault();
    setErrors({});
    try {
      const updated = await API.updateMe({ ...form, middle_name: form.middle_name || null });
      setUser(updated);
      notify('Профиль сохранён');
    } catch (err) {
      setErrors(err.fields || {});
      notify('Проверьте поля формы', { tone: 'error', description: err.message });
    }
  };

  const clearHistory = async () => {
    await API.clearHistory();
    setHistory([]);
    notify('История поиска очищена', { tone: 'info' });
  };

  const signOut = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="container page">
      <header className="profile-head">
        <Avatar user={{ ...user, avatar_color: form.avatar_color }} size={72} />
        <div className="profile-head__info">
          <h1>
            {user.first_name} {user.last_name}
          </h1>
          <p>
            @{user.login}, {user.role === 'admin' ? 'администратор' : 'зритель'} КиноДневника
          </p>
          {stats && (
            <div className="profile-head__stats">
              <span>
                Просмотрено <b>{stats.watched}</b>
              </span>
              <span>
                Рецензий <b>{stats.reviews}</b>
              </span>
              <span>
                В избранном <b>{stats.favorites}</b>
              </span>
            </div>
          )}
        </div>
        <div className="profile-head__actions">
          <Link to="/stats" className="btn">
            Статистика
          </Link>
          <button type="button" className="btn btn-danger-ghost" onClick={signOut}>
            Выйти из аккаунта
          </button>
        </div>
      </header>

      <div className="profile-grid">
        <div>
          <form className="panel" onSubmit={save} noValidate>
            <h2>Личные данные</h2>
            <div className="form-grid">
              <Field label="Фамилия" error={errors.last_name}>
                <input value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </Field>
              <Field label="Имя" error={errors.first_name}>
                <input value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </Field>
              <Field label="Отчество" error={errors.middle_name} hint="Необязательно">
                <input value={form.middle_name} onChange={e => set('middle_name', e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
            </div>
            <div className="color-picker">
              <span className="field__label">Цвет аватара</span>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-dot ${form.avatar_color === c ? 'is-active' : ''}`}
                  style={{ '--dot': c }}
                  onClick={() => set('avatar_color', c)}
                  aria-label={`Цвет ${c}`}
                />
              ))}
            </div>
            <button type="submit" className="btn btn-accent">
              Сохранить
            </button>
          </form>
          <p className="muted small" style={{ marginTop: 14 }}>
            Email для связи: {user.email}. Аккаунт может быть удалён администратором при нарушении{' '}
            <Link to="/rules">правил сервиса</Link>.
          </p>
        </div>

        <div>
          <section className="panel">
            <div className="panel__head">
              <h2>История поиска</h2>
              {history.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearHistory}>
                  Очистить
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="muted">Вы ещё ничего не искали.</p>
            ) : (
              <AnimatedList
                items={history}
                width="100%"
                maxHeight={300}
                accentColor="#f5f4f0"
                theme="graphite"
                frame={false}
                radius={8}
                showGradients
                onItemSelect={item => navigate(`/search?q=${encodeURIComponent(item.query)}`)}
                renderItem={item => (
                  <div className="history-row">
                    <b>{item.query}</b>
                    <span>
                      {item.results_count} рез. · {SOURCES[item.provider] || 'каталог'}
                    </span>
                    <time>{formatDateTime(item.searched_at)}</time>
                  </div>
                )}
              />
            )}
          </section>

          <section className="panel">
            <h2>Избранное</h2>
            {favorites.length === 0 ? (
              <p className="muted">Отмечайте любимые фильмы сердечком на странице фильма.</p>
            ) : (
              <div className="fav-row">
                {favorites.map(e => (
                  <Link key={e.id} to={`/movie/${e.movie.id}`} className="fav-row__item" title={e.movie.title}>
                    <Poster src={e.movie.poster_url} title={e.movie.title} year={e.movie.year} />
                  </Link>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
