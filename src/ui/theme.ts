export type Mode = 'light' | 'dark';

const palettes = {
  light: {
    bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b',
    primary: '#2563eb', accent: '#0891b2', danger: '#dc2626', ok: '#059669', selected: '#dbeafe', side: '#ffffff', input: '#ffffff', chip: '#e8f1ff',
  },
  dark: {
    bg: '#0b1220', card: '#111c33', border: '#24365c', text: '#f1f5f9', muted: '#94a3b8',
    primary: '#3b82f6', accent: '#22d3ee', danger: '#f87171', ok: '#34d399', selected: '#1d4ed8', side: '#0f1a30', input: '#0b1220', chip: '#16294d',
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
