export type Mode = 'light' | 'dark';

const palettes = {
  // "Soft cyan + amber" theme: blue-grey page, white cards, deep cyan actions (white text on it stays >= 4.5:1), amber highlights
  light: {
    bg: '#e6edf6', card: '#ffffff', border: '#d3e0ee', text: '#1b2a3c', muted: '#52627a',
    primary: '#0b7f99', accent: '#0e7490', danger: '#dc2626', ok: '#047857', selected: '#d4f1f8', selectedText: '#0b6e86', side: '#ffffff', input: '#ffffff', chip: '#e0f4f9',
    onPrimary: '#ffffff', highlight: '#f6b93b', highlightSoft: '#fdf0cf',
    pillOkBg: '#d1fae5', pillOkFg: '#065f46', pillWarnBg: '#fdecc0', pillWarnFg: '#8a5300', pillDangerBg: '#fee2e2', pillDangerFg: '#991b1b', pillMutedBg: '#dde6f1', pillMutedFg: '#334155',
  },
  dark: {
    bg: '#0a1822', card: '#10283a', border: '#244860', text: '#eef5fa', muted: '#9db4c6',
    primary: '#2fc3e0', accent: '#5fd8ee', danger: '#f87171', ok: '#34d399', selected: '#0e5a72', selectedText: '#ffffff', side: '#0d2232', input: '#0a1822', chip: '#12354a',
    onPrimary: '#06212c', highlight: '#f6b93b', highlightSoft: '#4a3a12',
    pillOkBg: '#064e3b', pillOkFg: '#a7f3d0', pillWarnBg: '#78350f', pillWarnFg: '#fde68a', pillDangerBg: '#7f1d1d', pillDangerFg: '#fecaca', pillMutedBg: '#1d3a4f', pillMutedFg: '#cbd5e1',
  },
} as const;

/** Mutable on purpose: the root layout remounts the tree (key = mode) after applyMode(), so every screen re-reads it. */
export const colors: { [K in keyof (typeof palettes)['light']]: string } = { ...palettes.light };

export function applyMode(mode: Mode) {
  Object.assign(colors, palettes[mode]);
}

/** Gradient pairs for the dashboard tiles (same in both modes). */
export const gradients = {
  blue: ['#0b7f99', '#3cc3dd'], green: ['#059669', '#34d399'], orange: ['#f59e0b', '#fcd34d'],
  purple: ['#7c3aed', '#c084fc'], red: ['#dc2626', '#fb7185'], slate: ['#334155', '#64748b'],
} as const;
export type GradientName = keyof typeof gradients;
