export type Mode = 'light' | 'dark';

const palettes = {
  light: {
    // muted/ok/accent darkened so small text reaches 4.5:1 on both the page and card backgrounds
    bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#526176',
    primary: '#2563eb', accent: '#0e7490', danger: '#dc2626', ok: '#047857', selected: '#dbeafe', selectedText: '#1d4ed8', side: '#ffffff', input: '#ffffff', chip: '#e8f1ff',
    pillOkBg: '#d1fae5', pillOkFg: '#065f46', pillWarnBg: '#fef3c7', pillWarnFg: '#92400e', pillDangerBg: '#fee2e2', pillDangerFg: '#991b1b', pillMutedBg: '#e2e8f0', pillMutedFg: '#334155',
  },
  dark: {
    bg: '#0b1220', card: '#111c33', border: '#24365c', text: '#f1f5f9', muted: '#94a3b8',
    primary: '#3b82f6', accent: '#22d3ee', danger: '#f87171', ok: '#34d399', selected: '#1d4ed8', selectedText: '#ffffff', side: '#0f1a30', input: '#0b1220', chip: '#16294d',
    pillOkBg: '#064e3b', pillOkFg: '#a7f3d0', pillWarnBg: '#78350f', pillWarnFg: '#fde68a', pillDangerBg: '#7f1d1d', pillDangerFg: '#fecaca', pillMutedBg: '#1e293b', pillMutedFg: '#cbd5e1',
  },
} as const;

/** Mutable on purpose: the root layout remounts the tree (key = mode) after applyMode(), so every screen re-reads it. */
export const colors: { [K in keyof (typeof palettes)['light']]: string } = { ...palettes.light };

export function applyMode(mode: Mode) {
  Object.assign(colors, palettes[mode]);
}

/** Gradient pairs for the dashboard tiles (same in both modes). */
export const gradients = {
  blue: ['#2563eb', '#22d3ee'], green: ['#059669', '#34d399'], orange: ['#ea580c', '#fbbf24'],
  purple: ['#7c3aed', '#c084fc'], red: ['#dc2626', '#fb7185'], slate: ['#334155', '#64748b'],
} as const;
export type GradientName = keyof typeof gradients;
