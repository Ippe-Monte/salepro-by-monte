/** Money helpers. Amounts are shown to the user only; the database computes the authoritative totals. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type Line = { qty: number; unit_price: number };

/** Mirrors the quotation trigger: subtotal, vat, total. Used for live preview while editing. */
export function totals(lines: Line[], discount: number, vatRate: number): { subtotal: number; vat: number; total: number } {
  const subtotal = round2(lines.reduce((s, l) => s + round2(l.qty * l.unit_price), 0));
  const base = Math.max(subtotal - discount, 0);
  const vat = round2((base * vatRate) / 100);
  return { subtotal, vat, total: round2(base + vat) };
}

export function baht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseNonNegative(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
