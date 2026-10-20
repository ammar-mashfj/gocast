/**
 * Every slot is AutoDJ airtime, so every swatch is a step on AutoDJ's violet
 * (the design system's colour rule) rather than a rainbow, with the ink that
 * reads on it. The steps are the design system's own violets
 * (mobile/src/lib/theme.ts: autodjArtA, autodj, autodjText, autodjDim).
 * Indexed by playlist order, so a playlist wears the same shade in the
 * schedule and in the AutoDJ rail.
 */
import type { CSSProperties } from "react"

export const SWATCHES: Swatch[] = [
  { fill: "bg-on-air-deep ring-1 ring-inset ring-on-air/40", ink: "text-on-air-text", dot: "bg-on-air-deep ring-1 ring-on-air/60" },
  { fill: "bg-on-air", ink: "text-background", dot: "bg-on-air" },
  { fill: "bg-on-air-text", ink: "text-on-air-tint", dot: "bg-on-air-text" },
  { fill: "bg-on-air-dim", ink: "text-on-air-text", dot: "bg-on-air-dim" },
]

/**
 * A preset swatch is classes only. A playlist with its own colour gets empty
 * classes and inline styles instead: `style` for a slot block (fill + ink),
 * `dotStyle` for a dot.
 */
export type Swatch = {
  fill: string
  ink: string
  dot: string
  style?: CSSProperties
  dotStyle?: CSSProperties
}

/** Readable text on `hex`: whichever of near-black or white contrasts more. */
export function inkFor(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  // Contrast with black is (L+0.05)/0.05, with white 1.05/(L+0.05); they
  // cross at L ≈ 0.179.
  return lum > 0.179 ? "#0d0d10" : "#ffffff"
}

/**
 * The swatch a playlist wears: its own colour when the owner picked one,
 * else the preset shade for its position.
 */
export function swatchForPlaylist(playlist: { color?: string | null }, index: number): Swatch {
  if (playlist.color) {
    return {
      fill: "",
      ink: "",
      dot: "",
      style: { backgroundColor: playlist.color, color: inkFor(playlist.color) },
      dotStyle: { backgroundColor: playlist.color },
    }
  }
  return playlistSwatch(index)
}

/**
 * The default playlist never draws a block on the schedule: it is the empty
 * cells between slots, which the legend shows as this inset square. Its dot
 * elsewhere matches, so no dot points at a colour the grid never shows.
 */
export const GAP_DOT = "border border-line-strong bg-surface-inset"

/** The dot a playlist wears in lists: its schedule colour, grey for the default. */
export function playlistDot(
  playlist: { is_default: boolean; color?: string | null },
  index: number,
): { className: string; style?: CSSProperties } {
  if (playlist.is_default) return { className: GAP_DOT }
  const swatch = swatchForPlaylist(playlist, index)
  return { className: swatch.dot, style: swatch.dotStyle }
}

/** What a dot means, for its tooltip. */
export function playlistDotTitle(playlist: { is_default: boolean }): string {
  return playlist.is_default ? "Fills the gaps between slots on the Schedule" : "Its colour on the Schedule"
}

/** The swatch for the playlist at `index` in the station's playlist order. */
export function playlistSwatch(index: number): Swatch {
  return SWATCHES[index % SWATCHES.length]
}
