import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { API } from '../api/client';
import DriftWall from '../components/reactbits/DriftWall/DriftWall';
import LogoLoop from '../components/reactbits/LogoLoop/LogoLoop';
import Poster from '../components/Poster';
import { Field, Notice } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Постеры каталога для стены на страницах входа и регистрации (загружаются один раз)
let wallCache = null;
function useWallPosters() {
  const [movies, setMovies] = useState(wallCache || []);
  useEffect(() => {
    if (wallCache) return;
    API.catalog({ sort: 'popular', limit: 30 })
      .then(list => {
        wallCache = list.filter(m => m.poster_url);
        setMovies(wallCache);
      })
      .catch(() => {});
  }, []);
  return movies;
}

// Общая сцена входа и регистрации: слева стена из постеров, справа форма.
// На телефоне стена заменяется узкой лентой постеров над формой.
export function AuthScene({ width = 420, children }) {
  const movies = useWallPosters();
  return (
    <div className="auth-page">
      <div className="auth-wall" aria-hidden="true">
        {movies.length > 0 && (
          <DriftWall
            items={movies.map(m => ({ image: m.poster_url, title: m.title }))}
            columns={5}
            tileWidth={150}
            tileHeight={225}
            gap={16}
            radius={6}
            tilt={14}
            turn={-12}
            speed={18}
            parallax={0.3}
            lift={0}
            dim={0.35}
            fade={0.5}
            overlayColor="#111214"
          />
        )}
        <p className="auth-wall__caption">Все постеры — из каталога КиноДневника.</p>
      </div>
      <div className="auth-panel">
        <div className="auth-card" style={{ '--auth-w': `${width}px` }}>
          {movies.length > 0 && (
            <div className="auth-strip" aria-hidden="true">
              <LogoLoop
                logos={movies.slice(0, 14).map(m => ({
                  node: (
                    <span className="ribbon-item ribbon-item--small">
                      <Poster src={m.poster_url} title={m.title} />
                    </span>
                  ),
                  ariaLabel: m.title,
                }))}
                speed={22}
                logoHeight={14}
                gap={10}
                fadeOut
                fadeOutWidth={0.08}
                draggable={false}
                ariaLabel="Постеры каталога"
              />
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/library" replace />;

  const submit = async e => {
    e.preventDefault();
    if (!form.login.trim() || !form.password) {
      setError('Введите логин и пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const me = await login(form.login.trim(), form.password);
      notify(`Добро пожаловать, ${me.first_name}!`);
      navigate(location.state?.from || '/library', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene>
      <h1>Вход</h1>
      <p className="auth-card__lead">Логин и пароль, указанные при регистрации.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Логин">
          <input
            autoComplete="username"
            value={form.login}
            onChange={e => setForm({ ...form, login: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <button type="submit" className="btn btn-accent btn-block" disabled={loading}>
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="auth-card__alt">
        Нет аккаунта? <Link to="/register">Создать дневник</Link>
      </p>
    </AuthScene>
  );
}
