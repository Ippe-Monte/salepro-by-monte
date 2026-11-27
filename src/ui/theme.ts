export type Mode = 'light' | 'dark';

const palettes = {
  // Fresh "white, aqua-teal & vivid orange" theme. Bright fills (primary, cta) carry DARK text (onPrimary/onCta, >= 6:1);
  // text/icons on white use the deeper teal "accent" (>= 5:1); body text is near-black for strong contrast.
  light: {
    bg: '#f0f8fb', card: '#ffffff', border: '#c5dce6', text: '#0b1b2b', muted: '#3d4f64',
    primary: '#14b8c9', accent: '#0b6f7e', danger: '#d92020', ok: '#047857', selected: '#d3f3f6', selectedText: '#085a67', side: '#ffffff', input: '#ffffff', chip: '#dcf4f7',
    onPrimary: '#032a33', cta: '#ff7a1a', onCta: '#2a1000', highlight: '#ff7a1a', highlightSoft: '#ffe4cc',
    pillOkBg: '#c9f5e0', pillOkFg: '#055c3f', pillWarnBg: '#ffe4cc', pillWarnFg: '#8a2c0a', pillDangerBg: '#fdd9d9', pillDangerFg: '#8f1212', pillMutedBg: '#dbeaf1', pillMutedFg: '#27394d',
  },
  dark: {
    bg: '#071a22', card: '#0f2c38', border: '#245566', text: '#f2fafc', muted: '#a8c4d0',
    primary: '#2dd4e0', accent: '#7ee8f0', danger: '#ff7b7b', ok: '#3ddba0', selected: '#10596a', selectedText: '#ffffff', side: '#0b2330', input: '#071a22', chip: '#123a49',
    onPrimary: '#032a33', cta: '#ff8a3d', onCta: '#2a1000', highlight: '#ff8a3d', highlightSoft: '#4d2a10',
    pillOkBg: '#064e3b', pillOkFg: '#b5f5da', pillWarnBg: '#7c2d12', pillWarnFg: '#ffd9b8', pillDangerBg: '#7f1d1d', pillDangerFg: '#ffd1d1', pillMutedBg: '#1d4252', pillMutedFg: '#d5e6ee',
  },
} as const;

/** Mutable on purpose: the root layout remounts the tree (key = mode) after applyMode(), so every screen re-reads it. */
export const colors: { [K in keyof (typeof palettes)['light']]: string } = { ...palettes.light };

export function applyMode(mode: Mode) {
  Object.assign(colors, palettes[mode]);
}

/** Gradient pairs for the dashboard tiles (same in both modes). */
export const gradients = {
  blue: ['#0e9fb4', '#5eead4'], green: ['#059669', '#34d399'], orange: ['#ff6a00', '#ffb066'],
  purple: ['#7c3aed', '#c084fc'], red: ['#dc2626', '#fb7185'], slate: ['#334155', '#64748b'],
} as const;
export type GradientName = keyof typeof gradients;
