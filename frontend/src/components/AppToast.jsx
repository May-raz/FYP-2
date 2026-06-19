import React, { useEffect, useState } from 'react';

let pushToast = null;

export function showAppToast(message, type = 'info') {
  if (pushToast) pushToast({ message: String(message || ''), type });
}

export function AppToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    pushToast = (next) => {
      setToast(next);
      window.clearTimeout(window.__appToastTimer);
      window.__appToastTimer = window.setTimeout(() => setToast(null), 4200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (!toast) return null;

  return (
    <div className={`app-toast app-toast-${toast.type}`} role="status">
      <span>{toast.message}</span>
      <button type="button" className="app-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
    </div>
  );
}
