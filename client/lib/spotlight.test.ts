import { describe, expect, it } from "vitest"
import type { Spotlight } from "@/interfaces/Spotlight"
import { canAutoOpen, endsLabel, isInternalLink, pickAutoOpen } from "./spotlight"

const make = (key: string, state: Spotlight["state"]): Spotlight => ({
  key,
  kind: "feature",
  title: key,
  chip_label: key,
  body_html: null,
  image_url: null,
  cta_label: null,
  cta_url: null,
  ends_at: null,
  state,
  preview: false,
})

describe("canAutoOpen", () => {
  it("opens on ordinary dashboard pages when nothing is on air", () => {
    expect(canAutoOpen("/dashboard", "idle")).toBe(true)
    expect(canAutoOpen("/dashboard/stations/maf/library", "idle")).toBe(true)
    expect(canAutoOpen("/dashboard/settings", null)).toBe(true)
  })

  it("never opens over the studio or go-live", () => {
    expect(canAutoOpen("/dashboard/stations/maf/live", "idle")).toBe(false)
    expect(canAutoOpen("/dashboard/stations/maf/studio", "idle")).toBe(false)
  })

  it("never opens while a show is running, wherever the host is", () => {
    expect(canAutoOpen("/dashboard/stations/maf/library", "live")).toBe(false)
    expect(canAutoOpen("/dashboard", "reconnecting")).toBe(false)
  })
})

describe("pickAutoOpen", () => {
  it("takes the first new one and skips minimised ones", () => {
    expect(pickAutoOpen([make("a", "minimized"), make("b", "new"), make("c", "new")])?.key).toBe("b")
    expect(pickAutoOpen([make("a", "minimized")])).toBeNull()
  })
})

describe("endsLabel", () => {
  const now = Date.parse("2026-11-27T12:00:00Z")

  it("counts hours inside the last day", () => {
    expect(endsLabel("2026-11-27T17:00:00Z", now)).toBe("Ends in 5 hours")
    expect(endsLabel("2026-11-27T13:00:00Z", now)).toBe("Ends in 1 hour")
    expect(endsLabel("2026-11-27T12:30:00Z", now)).toBe("Ends within the hour")
  })

  it("names the day further out", () => {
    expect(endsLabel("2026-12-01T12:00:00Z", now, "en-US")).toMatch(/^Ends .*Dec/)
  })

  it("is null with no end or a past one", () => {
    expect(endsLabel(null, now)).toBeNull()
    expect(endsLabel("2026-11-27T11:00:00Z", now)).toBeNull()
  })
})

describe("isInternalLink", () => {
  it("keeps dashboard paths in the app", () => {
    expect(isInternalLink("/dashboard/settings?coupon=BF")).toBe(true)
    expect(isInternalLink("//evil.example")).toBe(false)
    expect(isInternalLink("https://gocast.fm/blog")).toBe(false)
  })
})

describe("lava.top links", () => {
  it("tags a lava.top link with the account and the spotlight", async () => {
    const { isLavaLink, withLavaAccount } = await import("./billing")
    const link = "https://app.lava.top/products/abc/offer?currency=USD"
    expect(isLavaLink(link)).toBe(true)
    expect(isLavaLink("https://notlava.top.evil.example/x")).toBe(false)
    const tagged = new URL(withLavaAccount(link, "42", { medium: "spotlight", campaign: "bf-2026" }))
    expect(tagged.searchParams.get("utm_content")).toBe("42")
    expect(tagged.searchParams.get("utm_medium")).toBe("spotlight")
    expect(tagged.searchParams.get("utm_campaign")).toBe("bf-2026")
    expect(tagged.searchParams.get("currency")).toBe("USD")
  })
})
