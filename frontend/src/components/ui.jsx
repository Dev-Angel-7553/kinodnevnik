import { useEffect } from 'react';

// Заголовок страницы
export function PageHeader({ title, children, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {children && <p className="page-lead">{children}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

// Поле формы с подписью, подсказкой и сообщением об ошибке
export function Field({ label, error, hint, children, id }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`} htmlFor={id}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Modal({ title, children, onClose, footer }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', children }) {
  return <div className={`notice notice--${tone}`}>{children}</div>;
}

// Общие настройки выпадающих списков GlideSelect под графитовую тему
export const SELECT_THEME = {
  accentColor: '#ecebe8',
  surfaceColor: '#202226',
  highlightColor: '#2a2c31',
  textColor: '#ecebe8',
  showTags: false,
};
