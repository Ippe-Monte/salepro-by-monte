export type Mode = 'light' | 'dark';

const palettes = {
  // "White, light blue & orange" theme: near-white page, white cards with light-blue borders and tints,
  // blue actions, orange call-to-action + highlights. Text on blue/orange fills keeps >= 4.5:1.
  light: {
    bg: '#f5f9fd', card: '#ffffff', border: '#d6e6f4', text: '#172b3d', muted: '#52627a',
    primary: '#1976b8', accent: '#1565a0', danger: '#dc2626', ok: '#047857', selected: '#dff0fb', selectedText: '#14639c', side: '#ffffff', input: '#ffffff', chip: '#e8f4fc',
    onPrimary: '#ffffff', cta: '#c64609', onCta: '#ffffff', highlight: '#f97316', highlightSoft: '#ffedd5',
    pillOkBg: '#d1fae5', pillOkFg: '#065f46', pillWarnBg: '#ffedd5', pillWarnFg: '#9a3412', pillDangerBg: '#fee2e2', pillDangerFg: '#991b1b', pillMutedBg: '#e3eef8', pillMutedFg: '#334155',
  },
  dark: {
    bg: '#0b1824', card: '#112a3d', border: '#25465e', text: '#eef5fa', muted: '#9db4c6',
    primary: '#5bbcf2', accent: '#8fd3f7', danger: '#f87171', ok: '#34d399', selected: '#14506f', selectedText: '#ffffff', side: '#0e2234', input: '#0b1824', chip: '#143650',
    onPrimary: '#06202f', cta: '#fb923c', onCta: '#2a1000', highlight: '#fb923c', highlightSoft: '#4a2a10',
    pillOkBg: '#064e3b', pillOkFg: '#a7f3d0', pillWarnBg: '#7c2d12', pillWarnFg: '#fed7aa', pillDangerBg: '#7f1d1d', pillDangerFg: '#fecaca', pillMutedBg: '#1d3a4f', pillMutedFg: '#cbd5e1',
  },
} as const;

/** Mutable on purpose: the root layout remounts the tree (key = mode) after applyMode(), so every screen re-reads it. */
export const colors: { [K in keyof (typeof palettes)['light']]: string } = { ...palettes.light };

export function applyMode(mode: Mode) {
  Object.assign(colors, palettes[mode]);
}

/** Gradient pairs for the dashboard tiles (same in both modes). */
export const gradients = {
  blue: ['#1976b8', '#5bbcf2'], green: ['#059669', '#34d399'], orange: ['#ea580c', '#fdba74'],
  purple: ['#7c3aed', '#c084fc'], red: ['#dc2626', '#fb7185'], slate: ['#334155', '#64748b'],
} as const;
export type GradientName = keyof typeof gradients;
