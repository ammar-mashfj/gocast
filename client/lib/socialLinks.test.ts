import { describe, expect, it } from "vitest"
import { PICKER_PLATFORMS, cleanHandle, matchPickerPlatform, normalizeSocialUrl, resolveSocialLink } from "./socialLinks"

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

const platform = (key: string) => PICKER_PLATFORMS.find((p) => p.key === key)!

describe("picker platforms", () => {
  it("loads a saved address into its platform's row", () => {
    expect(matchPickerPlatform("https://www.instagram.com/mystation")).toMatchObject({ platform: { key: "instagram" }, handle: "mystation" })
    expect(matchPickerPlatform("https://bsky.app/profile/me.bsky.social")).toMatchObject({ platform: { key: "bluesky" }, handle: "me.bsky.social" })
  })

  it("leaves other addresses as Other links", () => {
    expect(matchPickerPlatform("https://youtu.be/abc")).toBeNull()
    expect(matchPickerPlatform("https://mystation.com")).toBeNull()
    expect(matchPickerPlatform("https://instagram.com/")).toBeNull()
  })

  it("trims a pasted address to the handle", () => {
    expect(cleanHandle(platform("instagram"), "https://www.instagram.com/mystation")).toBe("mystation")
    expect(cleanHandle(platform("instagram"), "@mystation")).toBe("mystation")
  })

  it("adds the @ where the address needs one", () => {
    expect(cleanHandle(platform("tiktok"), "mystation")).toBe("@mystation")
    expect(cleanHandle(platform("youtube"), "channel/UC123")).toBe("channel/UC123")
    expect(cleanHandle(platform("tiktok"), "")).toBe("")
  })

  it("never puts an @ in front of an address pasted into the field", () => {
    expect(cleanHandle(platform("youtube"), "https://www.youtube.com/watch?v=abc123")).toBe("watch?v=abc123")
    expect(cleanHandle(platform("youtube"), "playlist?list=PL9x")).toBe("playlist?list=PL9x")
    expect(cleanHandle(platform("youtube"), "@nightshift")).toBe("@nightshift")
    expect(cleanHandle(platform("youtube"), "night.shift_fm-1")).toBe("@night.shift_fm-1")
  })

  it("loads a saved link that isn't a profile as an Other link, so saving keeps it", () => {
    expect(matchPickerPlatform("https://www.youtube.com/watch?v=abc123")).toBeNull()
    expect(matchPickerPlatform("https://youtube.com/playlist?list=PL9x")).toBeNull()
    expect(matchPickerPlatform("https://www.youtube.com/live/NegzSl4HDuI?si=EOcAIZWJ")).toBeNull()
    // The field would turn this into @OldName.
    expect(matchPickerPlatform("https://youtube.com/OldName")).toBeNull()
  })

  it("still loads profiles into their platform's field", () => {
    expect(matchPickerPlatform("https://youtube.com/@nightshift")).toMatchObject({ platform: { key: "youtube" }, handle: "@nightshift" })
    expect(matchPickerPlatform("https://www.youtube.com/channel/UC9Y4C12oCF6MGOFOpA6ljcw")).toMatchObject({ platform: { key: "youtube" } })
    expect(matchPickerPlatform("https://tiktok.com/@nightshift/")).toMatchObject({ platform: { key: "tiktok" } })
    expect(matchPickerPlatform("https://vm.tiktok.com/ZS9AGv11YUuau-i2r4K/")).toBeNull()
  })
})
