import { useCallback, useEffect, useState } from 'react';

import { API } from '../api/client';
import Avatar from '../components/Avatar';
import Loader from '../components/Loader';
import Counter from '../components/reactbits/Counter/Counter';
import HoldButton from '../components/reactbits/HoldButton/HoldButton';
import { Field, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatDateTime } from '../utils';

const REASONS = [
  'Спам и реклама в рецензиях',
  'Оскорбления других пользователей',
  'Ссылки на пиратские ресурсы',
  'Мультиаккаунт',
  'Запрос пользователя на удаление',
];

export default function Admin() {
  const { user: me } = useAuth();
  const notify = useToast();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [log, setLog] = useState([]);
  const [providers, setProviders] = useState([]);
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const load = useCallback(() => {
    API.adminStats().then(setStats);
    API.adminUsers().then(setUsers);
    API.adminDeleted().then(setLog);
    API.providers().then(setProviders);
  }, []);

  useEffect(load, [load]);

  const confirmDelete = async () => {
    if (reason.trim().length < 5) {
      setReasonError('Укажите причину (не короче 5 символов)');
      return;
    }
    try {
      await API.adminDeleteUser(target.id, reason.trim());
      notify('Пользователь удалён', { description: `${target.login}: ${reason.trim()}` });
      setTarget(null);
      setReason('');
      load();
    } catch (err) {
      notify('Ошибка удаления', { tone: 'error', description: err.message });
    }
  };

  const enrich = async () => {
    const result = await API.adminEnrich().catch(err => ({ error: err.message }));
    if (result.error) notify('Не удалось обновить', { tone: 'error', description: result.error });
    else if (!result.sources?.length)
      notify('Нет ключей кинобаз', { tone: 'info', description: 'Рейтинги берутся из ПоискКино, TMDB и OMDb — добавьте ключ в backend/.env' });
    else notify('Рейтинги обновлены', { description: `Обновлено фильмов: ${result.updated} из ${result.checked}` });
  };

  const clearCache = async () => {
    const { removed } = await API.adminClearCache();
    notify('Кэш внешних API очищен', { tone: 'info', description: `Удалено записей: ${removed}` });
    load();
  };

  if (!stats) return <Loader />;

  const tiles = [
    ['Пользователи', stats.users],
    ['Фильмы в каталоге', stats.movies],
    ['Записи дневников', stats.entries],
    ['Поисковые запросы', stats.searches],
    ['Удалено аккаунтов', stats.deleted],
    ['Ответов API в кэше', stats.cache_items],
  ];

  return (
    <div className="container page">
      <PageHeader
        title="Администрирование"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={enrich}>
              Обновить рейтинги
            </button>
            <button type="button" className="btn btn-ghost" onClick={clearCache}>
              Очистить кэш API
            </button>
          </>
        }
      />

      <div className="admin-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="admin-tile">
            <Counter value={value} fontSize={34} fontWeight={650} locale="ru-RU" textColor="#f5f4f0" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section className="panel">
        <h2>Внешние API</h2>
        <div className="provider-list">
          {providers.map(p => (
            <div key={p.name} className={`provider ${p.configured ? 'is-on' : ''}`}>
              <span className="provider__dot" />
              <b>{p.title}</b>
              <span>{p.configured ? 'подключён' : 'нет ключа'}</span>
              <small>{p.free_limit}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Пользователи</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Логин</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Фильмов</th>
                <th>Регистрация</th>
                <th>Последний вход</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <span className="table-user">
                      <Avatar user={u} size={30} />
                      {u.last_name} {u.first_name}
                    </span>
                  </td>
                  <td>{u.login}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-chip role-chip--${u.role}`}>{u.role === 'admin' ? 'admin' : 'user'}</span>
                  </td>
                  <td>{u.entries_count}</td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>{formatDateTime(u.last_login_at)}</td>
                  <td>
                    {u.id !== me.id && u.role !== 'admin' && (
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-sm"
                        onClick={() => {
                          setTarget(u);
                          setReason('');
                          setReasonError('');
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Журнал удалений</h2>
        {log.length === 0 ? (
          <p className="muted">Удалённых пользователей нет.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Логин</th>
                  <th>Email</th>
                  <th>Причина</th>
                  <th>Удалил</th>
                </tr>
              </thead>
              <tbody>
                {log.map(row => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.deleted_at)}</td>
                    <td>{row.login}</td>
                    <td>{row.email}</td>
                    <td>{row.reason}</td>
                    <td>{row.deleted_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {target && (
        <Modal
          title={`Удаление пользователя ${target.login}`}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setTarget(null)}>
                Отмена
              </button>
              <HoldButton
                className="hold-danger"
                holdTime={1300}
                backgroundColor="#1e0d10"
                fillColor="#ff4757"
                textColor="#ff9aa5"
                fillTextColor="#000000"
                radius={8}
                glow={false}
                doneLabel="Удалено"
                disabled={reason.trim().length < 5}
                onHold={confirmDelete}
                onTap={() => notify('Удерживайте кнопку', { tone: 'info', description: 'Удаление срабатывает, когда кнопка заполнится' })}
              >
                Удерживайте для удаления
              </HoldButton>
            </>
          }
        >
          <p className="muted">
            Будут удалены дневник пользователя ({target.entries_count} записей) и история поиска. Запись о
            удалении сохранится в журнале.
          </p>
          <div className="chips">
            {REASONS.map(r => (
              <button key={r} type="button" className={`chip ${reason === r ? 'is-active' : ''}`} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
          <Field label="Причина удаления *" error={reasonError}>
            <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Опишите причину" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
