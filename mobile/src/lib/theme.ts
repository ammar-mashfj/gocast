/**
 * GoCast Studio design tokens (the Claude Design comp "GoCast Studio").
 * Colour carries meaning: coral is live (a person on air), violet is AutoDJ,
 * amber is Pro and warnings, green is "all good", and warm greys are
 * everything else. Keep new elements neutral unless they mean one of those.
 */
export const colors = {
  bg: '#0E0D0C',
  card: '#181614',
  chip: '#1D1A17',
  raised: '#221F1C',
  track: '#2A2723',
  sheet: '#1B1916',

  text: '#F4F1EC',
  muted: '#A39D94',
  faint: '#6F6A63',

  hairline: 'rgba(244,241,236,0.06)',
  line: 'rgba(244,241,236,0.08)',
  dashed: 'rgba(244,241,236,0.12)',
  border: 'rgba(244,241,236,0.14)',

  live: '#FF5A4E',
  liveInk: '#1A0806',
  liveText: '#FF8177',
  livePale: '#FFB3AC',
  liveSoft: '#FF8A80',
  liveSub: '#4A1510',
  liveBand: '#3A1714',
  liveDim: '#221A18',
  liveHot: '#FFF1E0',

  autodj: '#9B7BFF',
  autodjText: '#C9B8FF',
  autodjCard: '#1E1A2B',
  autodjDim: '#3A3350',
  autodjArtA: '#2B2540',
  autodjArtB: '#241F36',
  autodjArtInk: '#8A80B0',

  pro: '#FFB547',
  proInk: '#1A1206',
  proBand: '#33260F',
  proText: '#FFD48A',
  avatar: '#2A2419',

  ok: '#5FD39A',
};

/** Station art and playlist swatches, in the comp's order. */
export const SWATCHES = [colors.pro, colors.autodj, colors.ok, colors.live];

/** `alpha('#FF5A4E', 0.14)` → rgba string. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export type Weight = 400 | 500 | 600 | 700 | 800;

const DISPLAY: Record<Weight, string> = {
  400: 'BricolageGrotesque_400Regular',
  500: 'BricolageGrotesque_500Medium',
  600: 'BricolageGrotesque_600SemiBold',
  700: 'BricolageGrotesque_700Bold',
  800: 'BricolageGrotesque_800ExtraBold',
};

const MONO: Record<Weight, string> = {
  400: 'IBMPlexMono_400Regular',
  500: 'IBMPlexMono_500Medium',
  600: 'IBMPlexMono_600SemiBold',
  700: 'IBMPlexMono_700Bold',
  800: 'IBMPlexMono_700Bold',
};

/**
 * A font as the comp writes it: `font(800, 34, { tracking: -0.04 })`.
 * Tracking is in em and line height a multiple of the size, as in CSS.
 * Never pair these with fontWeight: Android then ignores the family.
 */
export function font(
  weight: Weight,
  size: number,
  opts: { mono?: boolean; tracking?: number; lineHeight?: number } = {},
) {
  return {
    fontFamily: (opts.mono ? MONO : DISPLAY)[weight],
    fontSize: size,
    ...(opts.tracking ? { letterSpacing: opts.tracking * size } : null),
    ...(opts.lineHeight ? { lineHeight: Math.round(opts.lineHeight * size) } : null),
  };
}

export const space = { gutter: 16, touch: 44 };
