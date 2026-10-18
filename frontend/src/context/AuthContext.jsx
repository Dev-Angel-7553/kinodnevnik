import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API, tokenStore } from '../api/client';

const AuthContext = createContext(null);

// Хранит текущего пользователя и предоставляет вход, регистрацию и выход
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    API.me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const applyToken = useCallback(response => {
    tokenStore.set(response.access_token);
    setUser(response.user);
    return response.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAdmin: user?.role === 'admin',
      login: async (login, password) => applyToken(await API.login(login, password)),
      register: async data => applyToken(await API.register(data)),
      logout: () => {
        tokenStore.clear();
        setUser(null);
      },
      setUser,
    }),
    [user, ready, applyToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
