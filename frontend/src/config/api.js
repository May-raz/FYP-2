import axios from 'axios';

const DEFAULT_PRODUCTION_API = 'https://gamification-server.vercel.app';

function resolveApiBase() {
  const fromEnv = String(
    process.env.REACT_APP_API_URL || process.env.REACT_APP_NODE_URL || ''
  ).trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (isLocal ? 'http://localhost:5001' : DEFAULT_PRODUCTION_API).replace(/\/$/, '');
}

export const API_BASE = resolveApiBase();
export const GAMIFICATION_BASE = resolveApiBase();

axios.defaults.baseURL = API_BASE;
axios.defaults.withCredentials = true;

export function getStoredToken() {
  const localToken = localStorage.getItem('token')?.trim();
  if (localToken) return localToken;
  const sessionToken = sessionStorage.getItem('token')?.trim();
  if (sessionToken) return sessionToken;
  const defaultAuth = String(axios.defaults.headers.common?.Authorization || '').trim();
  if (defaultAuth.toLowerCase().startsWith('bearer ')) {
    return defaultAuth.slice(7).trim();
  }
  return '';
}

export function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const quiet401 =
      status === 401 &&
      (url.includes('/api/user/profile') ||
        url.includes('/api/auth/login') ||
        url.includes('/api/auth/signup'));
    if (!quiet401 && process.env.NODE_ENV !== 'production') {
      console.error('API Error:', error.response?.data?.error || error.message);
    }
    return Promise.reject(error);
  }
);

export { axios };
