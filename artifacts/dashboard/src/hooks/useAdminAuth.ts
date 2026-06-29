import { useState } from 'react';
import { useLocation } from 'wouter';

const AUTH_KEY = 'beqolky_authenticated';

export function useAdminAuth() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAuthenticated = () => localStorage.getItem(AUTH_KEY) === 'true';

  const login = async (password: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/beqolky/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'كلمة المرور غير صحيحة');
        return false;
      }
      localStorage.setItem(AUTH_KEY, 'true');
      navigate("/beqolky");
      return true;
    } catch {
      setError('حدث خطأ في الاتصال');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = '/beqolky/login';
  };

  return { isAuthenticated, login, logout, loading, error };
}
