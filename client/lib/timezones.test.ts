import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { TIMEZONE_ALIASES, canonicalZone, supportedZones } from "./timezones"

describe("timezones", () => {
  it("maps Chrome's old names to the ones the API stores", () => {
    expect(canonicalZone("Asia/Calcutta")).toBe("Asia/Kolkata")
    expect(canonicalZone("Europe/Kiev")).toBe("Europe/Kyiv")
    expect(canonicalZone("Europe/London")).toBe("Europe/London")
  })

  it("lists current names only, once each", () => {
    const zones = supportedZones()
    expect(zones).toContain("Asia/Kolkata")
    expect(zones).not.toContain("Asia/Calcutta")
    expect(new Set(zones).size).toBe(zones.length)
  })

  // The API maps the same names (NormalizesTimezone). A rename added to only
  // one side either offers a name the API rejects or maps one never sent.
  it("keeps the same aliases as the API", () => {
    const php = readFileSync(resolve(__dirname, "../../api/app/Http/Requests/Concerns/NormalizesTimezone.php"), "utf8")
    const block = php.match(/TIMEZONE_ALIASES = \[([\s\S]*?)\];/)?.[1] ?? ""
    const api = Object.fromEntries([...block.matchAll(/'([^']+)'\s*=>\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))
    expect(Object.keys(api).length).toBeGreaterThan(0)
    expect(api).toEqual(TIMEZONE_ALIASES)
  })
})
