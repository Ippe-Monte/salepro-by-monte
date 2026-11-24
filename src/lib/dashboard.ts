import { stepOf, subOf, type PipelineRow } from './pipeline.ts';

export type Inv = { total: number; issue_date: string; status: string };
export type Tk = { id: string; status: string; created_at: string };

/** Month label key "YYYY-MM" of a date or timestamp string. */
export const monthKey = (iso: string) => iso.slice(0, 7);

/** Sales (invoices that are not cancelled) per month, oldest first, ending with the month of `now`. */
export function salesByMonth(invs: Inv[], now: Date, months = 6): { key: string; total: number }[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const v of invs) {
    if (v.status === 'cancelled' || v.status === 'draft') continue;
    const k = monthKey(v.issue_date);
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + Number(v.total || 0));
  }
  return keys.map((key) => ({ key, total: Math.round((sums.get(key) ?? 0) * 100) / 100 }));
}

/** Growth in percent against the previous period; null when there is nothing to compare with. */
export function growth(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export type BucketKey = 'new' | 'quote' | 'do' | 'dn' | 'inv' | 'done' | 'cancelled';
export const BUCKETS: { key: BucketKey; label: string; color: string }[] = [
  { key: 'new', label: 'รับงานใหม่', color: '#3b82f6' },
  { key: 'quote', label: 'ใบเสนอราคา', color: '#14b8a6' },
  { key: 'do', label: 'DO', color: '#f59e0b' },
  { key: 'dn', label: 'ใบส่งของ', color: '#8b5cf6' },
  { key: 'inv', label: 'รอชำระเงิน', color: '#ec4899' },
  { key: 'done', label: 'ปิดงานแล้ว', color: '#22c55e' },
  { key: 'cancelled', label: 'ยกเลิก', color: '#94a3b8' },
];

/** Every Job Ticket opened in the period, placed in exactly one status bucket. */
export function jobBuckets(tickets: Tk[], pipe: Record<string, PipelineRow | undefined>, since: Date | null): { key: BucketKey; label: string; color: string; count: number; pct: number }[] {
  const counts: Record<BucketKey, number> = { new: 0, quote: 0, do: 0, dn: 0, inv: 0, done: 0, cancelled: 0 };
  let total = 0;
  for (const t of tickets) {
    if (since && new Date(t.created_at) < since) continue;
    total += 1;
    if (t.status === 'cancelled') { counts.cancelled += 1; continue; }
    if (t.status === 'done') { counts.done += 1; continue; }
    const sub = subOf(pipe[t.id]);
    if (sub === 'inv_paid') { counts.done += 1; continue; }
    const step = stepOf(sub);
    counts[(['new', 'quote', 'do', 'dn', 'inv'] as const)[step - 1]] += 1;
  }
  return BUCKETS.map((b) => ({ ...b, count: counts[b.key], pct: total ? Math.round((counts[b.key] / total) * 1000) / 10 : 0 }));
}

/** Start of the chosen period (null = all time). */
export function sinceOf(period: '30d' | 'month' | 'year' | 'all', now: Date): Date | null {
  if (period === 'all') return null;
  if (period === '30d') return new Date(now.getTime() - 30 * 86400000);
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}
