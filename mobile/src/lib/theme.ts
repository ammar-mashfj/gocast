/**
 * GoCast design tokens for the app, from the repo's DESIGN.md. Colour is
 * vocabulary, not decoration: emerald means a person is live, violet is the
 * brand and ON AIR, sky means the mic is open, red means something is wrong,
 * amber means Pro, and grey means off air. Keep new elements neutral unless
 * they carry one of those meanings.
 */
export const colors = {
  bg: '#08080d',
  panel: '#101018',
  popover: '#13131d',
  mutedSurface: '#181822',

  violetFill: '#7f4ff0',
  violet: '#8b5cf6',
  violetText: '#a78bfa',
  violetPale: '#c4b5fd',

  live: '#34d399',
  liveText: '#6ee7b7',
  liveInk: '#03140d',

  mic: '#38bdf8',
  micText: '#7dd3fc',
  micInk: '#04121c',

  fault: '#ff6467',
  faultText: '#fca5a5',
  faultInk: '#1f0404',

  pro: '#f59e0b',
  proText: '#fcd34d',

  text: '#fafafa',
  textSecondary: '#d4d4d8',
  muted: '#a1a1aa',
  faint: '#7d7d87',

  hairline: 'rgba(255,255,255,0.09)',
  divider: 'rgba(255,255,255,0.06)',
  inputLine: 'rgba(255,255,255,0.13)',
  unlit: 'rgba(255,255,255,0.03)',
  unlitEdge: 'rgba(255,255,255,0.08)',
};

/** `alpha('#34d399', 0.08)` → rgba string, for the tinted strips and pills. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const fonts = {
  display: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
};

export const radius = { sm: 6, md: 8, lg: 10, xl: 14, xxl: 18, full: 9999 };

export const space = { gutter: 16, touch: 44 };

/**
 * Panel drop: grounds a surface, never glows. iOS only: Android's `elevation`
 * would also lift the panel above its siblings, over the pinned studio lamp,
 * and a black shadow on the near-black ground is barely visible anyway.
 */
export const panelShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.9,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 24 },
};
