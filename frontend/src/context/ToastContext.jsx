import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import SwipeToast from '../components/reactbits/SwipeToast/SwipeToast';

const ToastContext = createContext(() => {});

const FUSE = { success: '#2fd479', error: '#ff4757', info: '#4f9bff' };

// Всплывающие уведомления на основе компонента SwipeToast из React Bits
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((title, { description = '', tone = 'success' } = {}) => {
    const id = Date.now() + Math.random();
    setToasts(list => [...list.slice(-2), { id, title, description, tone }]);
  }, []);

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
            duration={3600}
            radius={10}
            onClose={() => remove(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
