/**
 * Every slot is AutoDJ airtime, so every swatch is a step on AutoDJ's violet
 * (the design system's colour rule) rather than a rainbow, with the ink that
 * reads on it. The steps are the design system's own violets
 * (mobile/src/lib/theme.ts: autodjArtA, autodj, autodjText, autodjDim).
 * Indexed by playlist order, so a playlist wears the same shade in the
 * schedule and in the AutoDJ rail.
 */
export const SWATCHES = [
  { fill: "bg-on-air-deep ring-1 ring-inset ring-on-air/40", ink: "text-on-air-text", dot: "bg-on-air-deep ring-1 ring-on-air/60" },
  { fill: "bg-on-air", ink: "text-background", dot: "bg-on-air" },
  { fill: "bg-on-air-text", ink: "text-on-air-tint", dot: "bg-on-air-text" },
  { fill: "bg-on-air-dim", ink: "text-on-air-text", dot: "bg-on-air-dim" },
]

export type Swatch = (typeof SWATCHES)[number]

/**
 * The default playlist never draws a block on the schedule: it is the empty
 * cells between slots, which the legend shows as this inset square. Its dot
 * elsewhere matches, so no dot points at a colour the grid never shows.
 */
export const GAP_DOT = "border border-line-strong bg-surface-inset"

/** The dot a playlist wears in lists: its schedule colour, grey for the default. */
export function playlistDot(playlist: { is_default: boolean }, index: number): string {
  return playlist.is_default ? GAP_DOT : playlistSwatch(index).dot
}

/** What a dot means, for its tooltip. */
export function playlistDotTitle(playlist: { is_default: boolean }): string {
  return playlist.is_default ? "Fills the gaps between slots on the Schedule" : "Its colour on the Schedule"
}

/** The swatch for the playlist at `index` in the station's playlist order. */
export function playlistSwatch(index: number): Swatch {
  return SWATCHES[index % SWATCHES.length]
}
