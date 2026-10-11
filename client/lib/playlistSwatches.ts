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

/** The swatch for the playlist at `index` in the station's playlist order. */
export function playlistSwatch(index: number): Swatch {
  return SWATCHES[index % SWATCHES.length]
}
