import { readFileSync } from "node:fs"
import { join } from "node:path"
import opentype from "opentype.js"
import { describe, expect, it, vi } from "vitest"
import { arabicFonts, coversArabic, measureShaped } from "./ogFonts"

function cairo(file: string): opentype.Font {
  const data = readFileSync(join(process.cwd(), "assets/fonts", file))
  return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
}

describe("measureShaped", () => {
  const bold = cairo("Cairo-Bold.ttf")
  const letterByLetter = (text: string) => [...text].reduce((sum, ch) => sum + bold.getAdvanceWidth(ch, 74), 0)

  // What Satori does, and why the card measures words itself: the joined word
  // is not the sum of its letters drawn alone.
  it.each(["مريم", "همزة", "مدى", "الأرقم"])("measures %s joined, not letter by letter", (word) => {
    const joined = measureShaped(bold, word, 74)
    expect(joined).toBeGreaterThan(0)
    expect(Math.abs(joined - letterByLetter(word))).toBeGreaterThan(1)
  })

  it("matches letter by letter for Latin, which does not join", () => {
    expect(measureShaped(bold, "Mariam", 74)).toBeCloseTo(letterByLetter("Mariam"), 0)
  })

  it("scales with the font size", () => {
    expect(measureShaped(bold, "مريم", 148)).toBeCloseTo(measureShaped(bold, "مريم", 74) * 2, 3)
  })
})

describe("arabicFonts", () => {
  it("loads Cairo in both weights from assets/fonts", async () => {
    const { fonts, measure } = await arabicFonts()

    expect(fonts.map((font) => [font.name, font.weight])).toEqual([["Cairo", 400], ["Cairo", 700]])
    // Each weight is measured with its own font.
    expect(measure("مريم", 74, 700)).toBeGreaterThan(0)
    expect(measure("مريم", 74, 700)).not.toBeCloseTo(measure("مريم", 74, 400), 0)
  })
})

describe("coversArabic", () => {
  const bold = cairo("Cairo-Bold.ttf")

  it.each([
    ["Arabic", "إذاعة القرآن الكريم"],
    ["Persian, with a non-joiner", "نمایش\u200Cها"],
    ["Urdu", "ریڈیو پاکستان"],
    ["Arabic-Indic digits", "٤٠٣٠"],
    ["an emoji beside Arabic, which is not Cairo's business", "راديو 🎵"],
    ["no Arabic at all", "Радио"],
  ])("covers %s", (_, text) => {
    expect(coversArabic(bold, text)).toBe(true)
  })

  it.each([
    ["Kurdish Sorani", "ڕادیۆ"],
    ["Pashto", "ږغ"],
    ["a presentation form", "\uFB50"],
  ])("does not cover %s", (_, text) => {
    expect(coversArabic(bold, text)).toBe(false)
  })
})

describe("arabicFonts cache", () => {
  it("retries a failed read on the next request, then keeps the fonts it got", async () => {
    vi.resetModules()
    const { arabicFonts: load } = await import("./ogFonts")
    const root = process.cwd()
    // A request whose read fails: the fonts are not where it looks.
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("/nonexistent")

    await expect(load()).rejects.toThrow(/ENOENT/)

    cwd.mockReturnValue(root)
    const retried = load()
    await expect(retried).resolves.toMatchObject({ fonts: [{ name: "Cairo" }, { name: "Cairo" }] })
    // Served from the cache from then on, even where a read would fail:
    // the failed load did not throw the good one away.
    cwd.mockReturnValue("/nonexistent")
    expect(load()).toBe(retried)

    cwd.mockRestore()
  })
})
