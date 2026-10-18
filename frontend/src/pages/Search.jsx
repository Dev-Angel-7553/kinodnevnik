import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { API } from '../api/client';
import Loader from '../components/Loader';
import MovieCard from '../components/MovieCard';
import FadeContent from '../components/reactbits/FadeContent/FadeContent';
import GlideSelect from '../components/reactbits/GlideSelect/GlideSelect';
import { EmptyState, Notice, PageHeader, SELECT_THEME } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SOURCES } from '../utils';

const PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Все источники' },
  { value: 'tmdb', label: 'TMDB' },
  { value: 'poiskkino', label: 'Кинопоиск' },
  { value: 'omdb', label: 'OMDb' },
  { value: 'wikipedia', label: 'Википедия' },
  { value: 'itunes', label: 'iTunes' },
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useToast();

  const q = params.get('q') || '';
  const provider = params.get('provider') || 'auto';
  const [input, setInput] = useState(q);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => setInput(q), [q]);

  // Выполняем поиск при изменении параметров адресной строки
  useEffect(() => {
    if (q.length < 2) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    API.search(q, provider === 'auto' ? undefined : provider)
      .then(setResult)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, provider]);

  useEffect(() => {
    if (user && !q) API.history().then(setHistory).catch(() => {});
  }, [user, q]);

  const submit = e => {
    e.preventDefault();
    const value = input.trim();
    if (value.length < 2) {
      setError('Введите не менее двух символов');
      return;
    }
    setParams({ q: value, ...(provider !== 'auto' && { provider }) });
  };

  // Фильм из внешнего API сначала импортируется в каталог, затем открывается карточка
  const open = async item => {
    if (item.local_id) {
      navigate(`/movie/${item.local_id}`);
      return;
    }
    if (!user) {
      notify('Войдите, чтобы добавить фильм', { tone: 'info', description: 'Импорт из внешних API доступен после входа' });
      navigate('/login', { state: { from: `/search?q=${encodeURIComponent(q)}` } });
      return;
    }
    setImporting(`${item.source}:${item.external_id}`);
    try {
      const movie = await API.importMovie(item.source, item.external_id);
      navigate(`/movie/${movie.id}`);
    } catch (err) {
      notify('Не удалось загрузить фильм', { tone: 'error', description: err.message });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="container page">
      <PageHeader title="Поиск фильмов">
        Сначала ищем в каталоге КиноДневника, затем во внешних кинобазах. Откройте найденный фильм, чтобы
        добавить его в дневник.
      </PageHeader>

      <form className="search-bar" onSubmit={submit} role="search">
        <input
          type="search"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Например: Дюна, Brat, Нолан"
          aria-label="Название фильма"
          autoFocus
        />
        <GlideSelect
          options={PROVIDER_OPTIONS}
          value={provider}
          onChange={value => setParams({ ...(q && { q }), ...(value !== 'auto' && { provider: value }) })}
          {...SELECT_THEME}
          menuWidth={210}
          ariaLabel="Источник данных"
        />
        <button type="submit" className="btn btn-accent">
          Найти
        </button>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
      {result?.warnings?.length > 0 && (
        <Notice tone="info">
          {result.warnings.join('. ')}. Показаны результаты, которые удалось получить.
        </Notice>
      )}

      {!q && history.length > 0 && (
        <div className="chips">
          <span className="chips__label">Недавние запросы:</span>
          {history.map(h => (
            <button key={h.id} type="button" className="chip" onClick={() => setParams({ q: h.query })}>
              {h.query}
            </button>
          ))}
        </div>
      )}

      {loading && <Loader label="Ищем фильмы…" />}

      {!loading && result && (
        <>
          <p className="results-meta">
            По запросу «{result.query}» найдено: <b>{result.items.length}</b>
            {result.provider && <>, внешний источник: {SOURCES[result.provider]}</>}
          </p>
          {result.items.length === 0 ? (
            <EmptyState title="Ничего не найдено">
              Проверьте написание или попробуйте оригинальное название фильма.
            </EmptyState>
          ) : (
            <FadeContent key={result.query + provider} className="movie-grid" stagger={0.03} duration={0.4}>
              {result.items.map(item => (
                <MovieCard
                  key={`${item.source}:${item.external_id}`}
                  movie={item}
                  status={item.my_status}
                  source={item.source}
                  busy={importing === `${item.source}:${item.external_id}`}
                  onClick={() => open(item)}
                />
              ))}
            </FadeContent>
          )}
        </>
      )}
    </div>
  );
}
