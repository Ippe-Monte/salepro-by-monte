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

// Soft page texture (web only): faint dot grid + a teal glow top-right and an orange glow bottom-left.
// Kept very light so text and cards stay the focus. Native ignores it.
export function bgPattern(): Record<string, unknown> {
  if (typeof document === 'undefined') return {};
  const dark = colors.bg === palettes.dark.bg;
  const dot = dark ? 'rgba(126,232,240,.10)' : 'rgba(11,111,126,.14)';
  const teal = dark ? 'rgba(45,212,224,.14)' : 'rgba(20,184,201,.16)';
  const orange = dark ? 'rgba(255,138,61,.10)' : 'rgba(255,122,26,.10)';
  return {
    backgroundImage: [
      `radial-gradient(520px 360px at 100% 0%, ${teal}, transparent 72%)`,
      `radial-gradient(480px 340px at 0% 100%, ${orange}, transparent 72%)`,
      `radial-gradient(${dot} 1.2px, transparent 1.7px)`,
    ].join(','),
    backgroundSize: 'auto, auto, 22px 22px',
    backgroundRepeat: 'no-repeat, no-repeat, repeat',
  };
}
