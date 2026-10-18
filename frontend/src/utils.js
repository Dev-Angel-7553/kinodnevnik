// Общие справочники и функции форматирования

export const STATUSES = {
  watched: { label: 'Просмотрен', short: 'Смотрел', color: '#2fd479' },
  planned: { label: 'Буду смотреть', short: 'В планах', color: '#4f9bff' },
  dropped: { label: 'Брошен', short: 'Брошен', color: '#8e9096' },
};

export const SOURCES = {
  tmdb: 'TMDB',
  poiskkino: 'Кинопоиск',
  omdb: 'OMDb',
  wikipedia: 'Википедия',
  itunes: 'iTunes',
  demo: 'Каталог',
};

// Регулярные выражения совпадают с серверными (app/schemas.py)
export const RULES = {
  name: /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё-]{1,49}$/,
  login: /^[A-Za-z0-9_]{3,32}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  password: /^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{8,64}$/,
};

export const formatDate = value =>
  value
    ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

export const formatDateTime = value =>
  value
    ? new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const formatRuntime = minutes => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} ч ${m.toString().padStart(2, '0')} мин` : `${m} мин`;
};

export const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const initials = user =>
  user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() : '';

export const todayISO = () => new Date().toISOString().slice(0, 10);
