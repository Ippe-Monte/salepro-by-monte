/** Date helpers for the schedule screens. Local time, no timezone library needed. */

/** Parse "2026-11-24" and "09:30" as local time. Returns null when invalid. */
export function parseLocal(dateText: string, timeText: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const out = new Date(y, mo - 1, da, h, mi, 0, 0);
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== da) return null;
  return out;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** "YYYY-MM-DD" in local time. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hhmm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Group items by local day, days ascending, items ascending by start. */
export function groupByDay<T extends { starts_at: string }>(items: T[]): { day: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const k = dayKey(new Date(it.starts_at));
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, items: list }));
}

/** Do two half-open time ranges overlap? */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
