import { useSyncExternalStore } from 'react';
import { translate, type Lang } from './translate';

export type { Lang };
const KEY = 'salepro.lang';
const listeners = new Set<() => void>();

function load(): Lang {
  try { return globalThis.localStorage?.getItem(KEY) === 'en' ? 'en' : 'th'; } catch { return 'th'; }
}
let current: Lang = load();

export function getLang(): Lang { return current; }

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try { globalThis.localStorage?.setItem(KEY, l); } catch { /* storage blocked: keep in memory only */ }
  try { if (typeof document !== 'undefined') document.documentElement.lang = l; } catch { /* not on web */ }
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getLang, () => 'th');
}

/** Translate a Thai UI string into the current language (re-renders when the language changes if called through useT). */
export function useT(): (text: string) => string {
  const lang = useLang();
  return (text: string) => translate(text, lang);
}

/** Locale for dates shown on screen: Thai (Buddhist year) in TH, British English in EN. */
export function dateLocale(): string { return current === 'en' ? 'en-GB' : 'th-TH'; }
