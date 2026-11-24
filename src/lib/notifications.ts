/** Pure helpers for the notification bell: which alerts exist and whether the user has seen them. */
export type Summary = { visits_today?: number; overdue_jobs?: number; invoices_overdue?: number; low_stock?: number; dn_waiting?: number };
export type Notice = { key: string; label: string; count: number; href: string; icon: string; tone: 'danger' | 'warn' | 'info' };

export function buildNotices(s: Summary | null, visitsTomorrow: number): Notice[] {
  if (!s) return [];
  const n = (v: number | undefined) => Number(v ?? 0);
  const all: Notice[] = [
    { key: 'visits_today', label: 'นัดเข้าพบวันนี้', count: n(s.visits_today), href: '/visits', icon: 'schedule', tone: 'info' },
    { key: 'visits_tomorrow', label: 'นัดเข้าพบพรุ่งนี้', count: visitsTomorrow, href: '/visits', icon: 'schedule', tone: 'info' },
    { key: 'overdue_jobs', label: 'Job เกินกำหนด', count: n(s.overdue_jobs), href: '/jobs', icon: 'ticket', tone: 'danger' },
    { key: 'invoices_overdue', label: 'อินวอยซ์เกินกำหนดชำระ', count: n(s.invoices_overdue), href: '/invoices', icon: 'wallet', tone: 'danger' },
    { key: 'low_stock', label: 'สินค้าใกล้หมดสต็อก', count: n(s.low_stock), href: '/stock', icon: 'warehouse', tone: 'warn' },
  ];
  return all.filter((x) => x.count > 0);
}

/** Stable text of the current alerts; the bell shows a badge only while it differs from what was last seen. */
export function signature(notices: Notice[]): string {
  return notices.map((x) => `${x.key}:${x.count}`).join('|');
}
