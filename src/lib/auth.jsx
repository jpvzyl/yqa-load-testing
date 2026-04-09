import { createContext, useContext, useState, useEffect } from 'react';
import { auth as authApi } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sarfat_lt_token');
    if (token) {
      authApi.me()
        .then(res => setUser(res.data.user))
        .catch(() => localStorage.removeItem('sarfat_lt_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);
    localStorage.setItem('sarfat_lt_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (email, password, name) => {
    const res = await authApi.register(email, password, name);
    localStorage.setItem('sarfat_lt_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch (_e) { /* best effort */ }
    localStorage.removeItem('sarfat_lt_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
