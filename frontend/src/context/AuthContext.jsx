import React, { createContext, useContext, useEffect, useState } from 'react';
import { axios, getStoredToken } from '../config/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      axios.get('/api/user/profile')
        .then((response) => setUser(response.data))
        .catch(() => {
          localStorage.removeItem('token');
          sessionStorage.removeItem('token');
          delete axios.defaults.headers.common.Authorization;
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      const token = String(response.data?.token || '').trim();
      localStorage.setItem('token', token);
      sessionStorage.setItem('token', token);
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      setUser(response.data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Login failed' };
    }
  };

  const signup = async (userData) => {
    try {
      const response = await axios.post('/api/auth/signup', userData);
      const token = String(response.data?.token || '').trim();
      localStorage.setItem('token', token);
      sessionStorage.setItem('token', token);
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      setUser(response.data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Signup failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    delete axios.defaults.headers.common.Authorization;
    setUser(null);
  };

  const updateUserLevel = async (level) => {
    try {
      const response = await axios.post('/api/user/set-level', { level });
      if (response.data.level_changed) {
        setUser((prev) => ({
          ...prev,
          level: response.data.level,
          proficiency_score: response.data.proficiency_score,
        }));
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to update level' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading, updateUserLevel }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
