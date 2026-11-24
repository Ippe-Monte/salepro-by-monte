import { EN } from './en.ts';

export type Lang = 'th' | 'en';

const THAI = /[฀-๿]/;
// Longest first so "รายการที่ไม่ได้ผูก…" wins over "รายการ".
const KEYS = Object.keys(EN).sort((a, b) => b.length - a.length);
const cache = new Map<string, string>();

/**
 * Thai → English. Exact fragments are looked up first. Text composed at run time (e.g. "5 รายการ") is translated piece by
 * piece, but only if every Thai character ends up translated: user data in Thai (customer names, notes) is never half-translated.
 */
export function translate(text: string, lang: Lang): string {
  if (lang === 'th' || !text || !THAI.test(text)) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  const core = text.trim();
  let out = EN[core] !== undefined ? lead + EN[core] + trail : text;
  if (out === text) {
    let s = text;
    for (const k of KEYS) if (s.includes(k)) s = s.split(k).join(EN[k]);
    out = THAI.test(s) ? text : s;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(text, out);
  return out;
}
