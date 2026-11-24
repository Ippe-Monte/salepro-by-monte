/** Business-card colours: a wide palette (white and black included) plus any custom #RRGGBB. */
export const CARD_PALETTE: string[] = [
  '#ffffff', '#f1f5f9', '#cbd5e1', '#94a3b8', '#475569', '#1e293b', '#0f172a', '#000000',
  '#fecaca', '#ef4444', '#b91c1c', '#7f1d1d', '#fed7aa', '#f97316', '#c2410c', '#ca8a04',
  '#fef08a', '#eab308', '#bbf7d0', '#22c55e', '#047857', '#064e3b', '#99f6e4', '#14b8a6',
  '#bae6fd', '#0ea5e9', '#1d4ed8', '#1e3a8a', '#ddd6fe', '#8b5cf6', '#6d28d9', '#4c1d95',
  '#fbcfe8', '#ec4899', '#9d174d', '#78350f',
];

export const LEGACY_THEME_COLOR = { blue: '#1d4ed8', dark: '#0f172a', green: '#047857', orange: '#c2410c', purple: '#6d28d9' } as const;

export function isHex(v: string): boolean { return /^#[0-9a-fA-F]{6}$/.test(v); }

/** Accepts "1d4ed8" or "#1D4ED8"; returns lowercase "#rrggbb" or null. */
export function normalizeHex(v: string): string | null {
  const t = v.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(t) ? `#${t.toLowerCase()}` : null;
}

function lin(c: number): number { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Readable text colour on top of a card colour: whichever of white / dark navy has more contrast. */
export function textOn(hex: string): '#ffffff' | '#0f172a' {
  const l = luminance(hex);
  const vsWhite = 1.05 / (l + 0.05);
  const vsDark = (l + 0.05) / (luminance('#0f172a') + 0.05);
  return vsWhite >= vsDark ? '#ffffff' : '#0f172a';
}
