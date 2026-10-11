import { describe, expect, it } from "vitest"
import { normalizeSocialUrl, resolveSocialLink } from "./socialLinks"

const resolve = (input: string) => resolveSocialLink({ label: null, url: normalizeSocialUrl(input) })

describe("resolveSocialLink", () => {
  it("accepts ordinary web addresses", () => {
    expect(resolve("instagram.com/nightshift")?.name).toBe("Instagram")
    expect(resolve("https://my-site.co.uk/shows")?.name).toBe("my-site.co.uk")
  })

  it("refuses text with spaces in the host, which the API would reject", () => {
    // Chromium percent-encodes these into the host instead of throwing.
    expect(resolve("not a url")).toBeNull()
    expect(resolve("https://a b.com")).toBeNull()
  })

  it("refuses anything that isn't http(s)", () => {
    expect(resolve("javascript:alert(1)")).toBeNull()
  })
})
