/**
 * Right-to-left text for the share-image renderer (next/og, i.e. Satori).
 *
 * Satori shapes Arabic letters but lays every line out left to right: the
 * words of an Arabic name come out in reverse order, and a number or a Latin
 * word lands on the wrong side. A browser runs the Unicode bidi algorithm;
 * Satori does not. These helpers do the part of it a station name needs:
 * decide the direction of the whole name, then cut it into pieces that each
 * read correctly on their own, for the caller to lay out right to left.
 */

/** Arabic, Arabic Supplement, Arabic Extended-A, and both presentation-form blocks. */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

/** Strong left-to-right letters a station name may hold: Latin, with accents. */
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/

/** A word that reads left to right: has a Latin letter or a digit. */
const LTR_WORD = /[A-Za-z0-9À-ɏ]/

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text)
}

/**
 * Whether the text as a whole reads right to left. Like a browser's
 * dir="auto": the first strong letter decides, and digits and punctuation
 * don't count, so "2103 مهارات" is right to left and "Radio نور FM" is not.
 */
export function isRtl(text: string): boolean {
  for (const ch of text) {
    if (ARABIC_SCRIPT.test(ch)) return true
    if (LATIN_LETTER.test(ch)) return false
  }
  return false
}

/**
 * The pieces of a right-to-left text, in reading order: each Arabic word on
 * its own, a run of Latin words and numbers kept together (it reads left to
 * right inside), and punctuation on its own so it sits between its
 * neighbours. Laid out from the right, in this order, they read as a browser
 * would show them.
 *
 * Each Arabic word is its own piece, rather than a run of them, because a
 * run that wraps is laid out left to right again inside its own box.
 */
export function rtlPieces(text: string): string[] {
  const pieces: { text: string; ltr: boolean }[] = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const ltr = !ARABIC_SCRIPT.test(word) && LTR_WORD.test(word)
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
