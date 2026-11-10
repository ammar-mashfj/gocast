/**
 * Right-to-left text for the share-image renderer (next/og, i.e. Satori).
 *
 * Satori shapes Arabic letters but lays every line out left to right: the
 * words of an Arabic name come out in reverse order, and a number or a Latin
 * word lands on the wrong side. A browser runs the Unicode bidi algorithm;
 * Satori does not. These helpers do the part of it a station name needs:
 * decide the direction of the whole name, then cut it into pieces that each
 * read correctly on their own, for the caller to lay out.
 *
 * Every range below is written as \u escapes on purpose: one of the
 * characters involved (U+FEFF) is invisible in an editor.
 */

/**
 * Arabic, Arabic Supplement, Arabic Extended-A, and both presentation-form
 * blocks. Not U+FEFF at the end of the last block: that is the invisible
 * byte-order mark pasted text often starts with, not a letter.
 */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/

/** Letters of the right-to-left scripts a name is likely to hold: Hebrew and Arabic. */
const RTL_LETTER = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/

const LETTER = /\p{L}/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/** Zero-width non-joiner: breaks the joining inside a word (Persian uses it constantly). */
export const JOIN_BREAK = "\u200C"

/**
 * Invisible formatting characters to drop before drawing: the joiner, the
 * direction marks and embeddings, the Arabic letter mark and the byte-order
 * mark. None changes what a card should show, and the fonts have no glyph
 * for them, which would send next/og looking for one online.
 */
const INVISIBLE = /[\u200D\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g

export function withoutInvisibles(text: string): string {
  return text.replace(INVISIBLE, "")
}

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text)
}

/**
 * Whether the text as a whole reads right to left. Like a browser's
 * dir="auto": the first letter decides, and digits (Arabic-Indic ones
 * included), punctuation and invisible marks don't count. So "2103 مهارات"
 * is right to left, and "Radio نور FM" and "Радио نور" are not.
 */
export function isRtl(text: string): boolean {
  for (const ch of text) {
    if (!LETTER.test(ch)) continue
    return RTL_LETTER.test(ch)
  }
  return false
}

/**
 * The pieces of a right-to-left text, in reading order: each Arabic word on
 * its own, a run of other words and numbers kept together (Latin, Cyrillic
 * and so on read left to right inside), and punctuation on its own so it
 * sits between its neighbours. Laid out from the right, in this order, they
 * read as a browser would show them.
 *
 * Each Arabic word is its own piece, rather than a run of them, because a
 * run that wraps is laid out left to right again inside its own box.
 */
export function rtlPieces(text: string): string[] {
  const pieces: { text: string; ltr: boolean }[] = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const ltr = !ARABIC_SCRIPT.test(word) && LETTER_OR_DIGIT.test(word)
    const last = pieces[pieces.length - 1]
    if (ltr && last?.ltr) {
      last.text += ` ${word}`
    } else {
      pieces.push({ text: word, ltr })
    }
  }
  return pieces.map((piece) => piece.text)
}

/**
 * The pieces of a left-to-right text that holds Arabic ("Radio نور FM"), in
 * the order to lay them out from the left: as rtlPieces, except that a run of
 * Arabic words reads right to left inside the line, so it is reversed.
 */
export function ltrPieces(text: string): string[] {
  const out: string[] = []
  let arabicRun: string[] = []
  for (const piece of rtlPieces(text)) {
    if (ARABIC_SCRIPT.test(piece)) {
      arabicRun.push(piece)
      continue
    }
    out.push(...arabicRun.reverse(), piece)
    arabicRun = []
  }
  out.push(...arabicRun.reverse())
  return out
}

/**
 * The parts of an Arabic word split where a zero-width non-joiner breaks its
 * joining, in reading order. Drawn as separate boxes with no gap between
 * them, each part is shaped on its own: the break a browser would show.
 */
export function joinParts(word: string): string[] {
  return word.split(JOIN_BREAK).filter(Boolean)
}
