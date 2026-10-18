import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import SwipeToast from '../components/reactbits/SwipeToast/SwipeToast';

const ToastContext = createContext(() => {});

const FUSE = { success: '#2fd479', error: '#ff4757', info: '#4f9bff' };
const PHONE = '(max-width: 640px)';

// На телефоне уведомления показываются сверху по одному и короче, чтобы не закрывать
// нижнюю док-панель и кнопки на карточках
function usePhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const update = () => setPhone(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

// Всплывающие уведомления на основе компонента SwipeToast из React Bits
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const phone = usePhone();

  const notify = useCallback(
    (title, { description = '', tone = 'success' } = {}) => {
      const id = Date.now() + Math.random();
      setToasts(list => [...(phone ? [] : list.slice(-2)), { id, title, description, tone }]);
    },
    [phone]
  );

  const remove = id => setToasts(list => list.filter(t => t.id !== id));
  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <SwipeToast
            key={t.id}
            inline
            title={t.title}
            description={t.description}
            background="#151517"
            color="#f5f4f0"
            fuseColor={FUSE[t.tone]}
            duration={phone ? 2600 : 3600}
            radius={phone ? 12 : 10}
            edge={phone ? 'top' : 'bottom'}
            swipeDistance={phone ? 24 : 40}
            onClose={() => remove(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
