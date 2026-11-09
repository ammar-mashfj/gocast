import { describe, expect, it } from "vitest"
import { hasArabicScript, isRtl, ltrPieces, rtlPieces } from "./rtlText"

describe("hasArabicScript", () => {
  it.each([
    ["Arabic", "إذاعة القرآن"],
    ["Persian letters", "رادیو"],
    ["Arabic Supplement", "ݐ"],
    ["Arabic Extended-A", "ࢠ"],
    ["presentation forms A", "ﭐ"],
    ["presentation forms B", "ﻼ"],
    ["a mixed name", "جسور | JUSOOR RADIO"],
  ])("finds %s", (_, text) => {
    expect(hasArabicScript(text)).toBe(true)
  })

  it.each([
    ["Latin", "Night Shift Radio"],
    ["accents", "Café Música"],
    ["digits and punctuation", "4030 | 17"],
    ["Hebrew, which is not Arabic script", "רדיו"],
    ["empty", ""],
  ])("finds none in %s", (_, text) => {
    expect(hasArabicScript(text)).toBe(false)
  })
})

describe("isRtl", () => {
  it.each([
    ["an Arabic name", "مع مريم", true],
    ["a number before Arabic", "2103 مهارات اللغة", true],
    ["Arabic before Latin", "جسور | JUSOOR RADIO", true],
    ["Latin before Arabic", "Radio نور FM", false],
    ["a Latin name", "Night Shift Radio", false],
    ["only digits", "4030", false],
    ["punctuation before Arabic", "« صوت »", true],
  ])("%s", (_, text, rtl) => {
    expect(isRtl(text)).toBe(rtl)
  })
})

describe("rtlPieces", () => {
  it("gives each Arabic word its own piece, in reading order", () => {
    expect(rtlPieces("دروس مسجد الأرقم")).toEqual(["دروس", "مسجد", "الأرقم"])
  })

  it("keeps a number as a piece of its own", () => {
    expect(rtlPieces("2103 مهارات اللغة الانجليزية")).toEqual(["2103", "مهارات", "اللغة", "الانجليزية"])
    expect(rtlPieces("رادیو 4030")).toEqual(["رادیو", "4030"])
  })

  it("keeps a run of Latin words together, and punctuation apart", () => {
    expect(rtlPieces("جسور | JUSOOR RADIO")).toEqual(["جسور", "|", "JUSOOR RADIO"])
  })

  it("splits Latin runs that Arabic interrupts", () => {
    expect(rtlPieces("مع Radio One و FM 101")).toEqual(["مع", "Radio One", "و", "FM 101"])
  })

  it("ignores extra spaces", () => {
    expect(rtlPieces("  مع   مريم  ")).toEqual(["مع", "مريم"])
  })
})

describe("ltrPieces", () => {
  it("keeps Latin in order around one Arabic word", () => {
    expect(ltrPieces("Radio نور FM")).toEqual(["Radio", "نور", "FM"])
  })

  it("reverses a run of Arabic words, which reads right to left inside the line", () => {
    expect(ltrPieces("Radio صوت الحرية FM")).toEqual(["Radio", "الحرية", "صوت", "FM"])
  })

  it("reverses a run at the end", () => {
    expect(ltrPieces("Live: صوت الحرية")).toEqual(["Live:", "الحرية", "صوت"])
  })
})
