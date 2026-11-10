import { describe, expect, it } from "vitest"
import { hasArabicScript, isRtl, joinParts, ltrPieces, rtlPieces, withoutInvisibles } from "./rtlText"

describe("hasArabicScript", () => {
  it.each([
    ["Arabic", "إذاعة القرآن"],
    ["Persian letters", "رادیو"],
    ["Arabic Supplement", "ݐ"],
    ["Arabic Extended-A", "ࢠ"],
    ["presentation forms A", "\uFB50"],
    ["presentation forms B", "\uFEFC"],
    ["a mixed name", "جسور | JUSOOR RADIO"],
  ])("finds %s", (_, text) => {
    expect(hasArabicScript(text)).toBe(true)
  })

  it.each([
    ["Latin", "Night Shift Radio"],
    ["accents", "Café Música"],
    ["digits and punctuation", "4030 | 17"],
    ["Hebrew, which is not Arabic script", "רדיו"],
    ["a byte-order mark", "\uFEFFRadio"],
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
    ["a byte-order mark before a Latin name", "\uFEFFRadio نور FM", false],
    ["Arabic-Indic digits before a Latin name", "٤٠٣٠ Radio", false],
    ["Arabic-Indic digits before Arabic", "٤٠٣٠ راديو", true],
    ["Cyrillic before Arabic", "Радио نور", false],
    ["Greek", "Ράδιο", false],
    ["Hebrew", "רדיו נור", true],
    ["a right-to-left mark before Latin", "\u200FRadio", false],
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

describe("Cyrillic and other scripts in pieces", () => {
  it("keeps a run of Cyrillic together, like Latin", () => {
    expect(rtlPieces("نور Радио Москва")).toEqual(["نور", "Радио Москва"])
    expect(ltrPieces("Радио نور ФМ")).toEqual(["Радио", "نور", "ФМ"])
  })

  it("gives Arabic-Indic digits a piece of their own", () => {
    expect(rtlPieces("راديو ٤٠٣٠")).toEqual(["راديو", "٤٠٣٠"])
  })
})

describe("withoutInvisibles", () => {
  it("drops the marks no font draws, and keeps the non-joiner", () => {
    expect(withoutInvisibles("\uFEFF\u200Fراديو\u200D \u202Bنور\u202C\u061C")).toBe("راديو نور")
    expect(withoutInvisibles("نمایش\u200Cها")).toBe("نمایش\u200Cها")
  })
})

describe("joinParts", () => {
  it("splits a word where a non-joiner breaks it", () => {
    expect(joinParts("نمایش\u200Cها")).toEqual(["نمایش", "ها"])
    expect(joinParts("می\u200Cخواهم\u200C")).toEqual(["می", "خواهم"])
  })

  it("leaves a word without one whole", () => {
    expect(joinParts("راديو")).toEqual(["راديو"])
  })
})
