import { useCallback, useEffect, useRef, useState } from 'react';
import { loadReadIds, makeId, saveReadIds } from './portalUtils';

/** Re-renders on an interval so countdowns stay live. */
export function useNow(interval = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

/** Light/dark theme, persisted and applied to <html data-theme>. */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('portal_theme');
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('portal_theme', theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}

/** Cross-tab sync: useStorageSync({ assignments: () => reload() }) */
export function useStorageSync(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === null) return Object.values(ref.current).forEach((fn) => fn());
      ref.current[e.key]?.();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = makeId();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return { toasts, push };
}

/** Tracks which notification ids a user has already seen. */
export function useReadState(userId) {
  const [readIds, setReadIds] = useState(() => loadReadIds(userId));
  const markAll = useCallback(
    (ids) =>
      setReadIds((prev) => {
        const next = [...new Set([...prev, ...ids])];
        saveReadIds(userId, next);
        return next;
      }),
    [userId]
  );
  const markOne = useCallback((id) => markAll([id]), [markAll]);
  return { readIds, markAll, markOne };
}