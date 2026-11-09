import { readFile } from "node:fs/promises"
import { join } from "node:path"
import opentype from "opentype.js"

/**
 * Cairo, for share cards with Arabic-script text (lib/rtlText.ts).
 *
 * Without fonts of its own, next/og fetches Noto Sans Arabic from Google for
 * Arabic glyphs, and its shaper throws on that font's GSUB tables ("lookupType:
 * 5 - substFormat: 3 is not yet supported"): the image request fails and the
 * station is shared with no picture. Noto Naskh Arabic fails the same way;
 * Cairo shapes correctly, covers Persian letters and Latin too, and ships in
 * the repo (assets/fonts, SIL OFL), so nothing is fetched at render time.
 *
 * process.cwd() is the project root in dev and .next/standalone in prod,
 * where next.config.ts's outputFileTracingIncludes puts assets/fonts.
 */
export type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" }

export type ArabicCardFonts = {
  fonts: OgFont[]
  /** The width an Arabic word really takes when drawn, letters joined. */
  measure: (text: string, fontSize: number, weight: 400 | 700) => number
}

/**
 * Satori (0.25) sizes text by adding up each letter measured on its own, so
 * an Arabic word is laid out at the width of its UNJOINED letters but drawn
 * joined: some words overlap their neighbour, others leave a gap. Measuring
 * the whole word with the font's own shaping (init/medi/fina/rlig, opentype's
 * defaults, the same library Satori draws with) gives the width to lay it out
 * at.
 */
export function measureShaped(font: opentype.Font, text: string, fontSize: number): number {
  return font.getAdvanceWidth(text, fontSize)
}

function parse(data: Buffer): opentype.Font {
  return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
}

let cairo: Promise<ArabicCardFonts> | null = null

export function arabicFonts(): Promise<ArabicCardFonts> {
  cairo ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Cairo-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Cairo-Bold.ttf")),
  ]).then(([regular, bold]) => {
    const shapers = { 400: parse(regular), 700: parse(bold) }
    return {
      fonts: [
        { name: "Cairo", data: regular, weight: 400, style: "normal" },
        { name: "Cairo", data: bold, weight: 700, style: "normal" },
      ],
      measure: (text, fontSize, weight) => measureShaped(shapers[weight], text, fontSize),
    }
  })
  // A failed read is not cached: the next request tries again.
  cairo.catch(() => { cairo = null })
  return cairo
}
