import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Fragment } from 'react';
import { applyMode, type Mode } from './theme';

const KEY = 'salepro.theme';
function load(): Mode {
  try { return globalThis.localStorage?.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

const Ctx = createContext<{ mode: Mode; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => { const m = load(); applyMode(m); return m; });
  const toggle = useCallback(() => {
    setMode((m) => {
      const next: Mode = m === 'dark' ? 'light' : 'dark';
      applyMode(next);
      try { globalThis.localStorage?.setItem(KEY, next); } catch { /* storage unavailable: keep in memory */ }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <Ctx.Provider value={value}><Fragment key={mode}>{children}</Fragment></Ctx.Provider>;
}
export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('ThemeProvider missing');
  return v;
}
