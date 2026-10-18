// HTTP-клиент для REST API «КиноДневник».
// Добавляет JWT-токен в заголовок и превращает ошибки сервера в ApiError.

const TOKEN_KEY = 'kd_token';

export class ApiError extends Error {
  constructor(message, status, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields; // { имяПоля: 'сообщение' } — для подсветки полей формы
  }
}

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* приватный режим браузера — токен живёт до перезагрузки */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* нечего очищать */
    }
  },
};

export async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Сервер недоступен. Проверьте подключение.', 0);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message || 'Ошибка запроса';
    if (response.status === 401) tokenStore.clear();
    throw new ApiError(message, response.status, detail?.fields || {});
  }
  return data;
}

export const API = {
  // авторизация
  login: (login, password) => request('/auth/login', { method: 'POST', body: { login, password } }),
  register: data => request('/auth/register', { method: 'POST', body: data }),
  me: () => request('/auth/me'),

  // фильмы и внешние API
  search: (q, provider) => request('/movies/search', { params: { q, provider } }),
  catalog: params => request('/movies/catalog', { params }),
  summary: () => request('/movies/summary'),
  providers: () => request('/movies/providers'),
  genres: () => request('/movies/genres'),
  movie: id => request(`/movies/${id}`),
  reviews: id => request(`/movies/${id}/reviews`),
  importMovie: (source, externalId) =>
    request('/movies/import', { method: 'POST', body: { source, external_id: externalId } }),

  // дневник просмотров
  library: params => request('/library', { params }),
  saveEntry: data => request('/library', { method: 'POST', body: data }),
  updateEntry: (id, data) => request(`/library/${id}`, { method: 'PATCH', body: data }),
  deleteEntry: id => request(`/library/${id}`, { method: 'DELETE' }),

  // статистика и профиль
  stats: () => request('/stats/me'),
  updateMe: data => request('/users/me', { method: 'PATCH', body: data }),
  history: () => request('/users/me/history'),
  clearHistory: () => request('/users/me/history', { method: 'DELETE' }),

  // администрирование
  adminStats: () => request('/admin/stats'),
  adminUsers: () => request('/admin/users'),
  adminDeleteUser: (id, reason) => request(`/admin/users/${id}`, { method: 'DELETE', body: { reason } }),
  adminDeleted: () => request('/admin/deleted'),
  adminClearCache: () => request('/admin/cache', { method: 'DELETE' }),
  adminEnrich: () => request('/admin/enrich', { method: 'POST' }),
};
