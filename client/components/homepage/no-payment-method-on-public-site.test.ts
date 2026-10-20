import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * How Pro is paid for is said inside the dashboard only. The public site —
 * homepage, marketing, help, blog, terms, player pages — must never name the
 * payment method or provider, so search engines and visitors never see it.
 */
const PUBLIC_ROOTS = ["app/(home)", "app/(marketing)", "app/station", "app/embed", "components/homepage"]
const FORBIDDEN = /\b(crypto\w*|usdt|usdc|stablecoin\w*|oxapay|blockchain|bitcoin|digital currenc\w*)\b/i

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx?|mdx?)$/.test(name) && !name.includes(".test.") ? [path] : []
  })
}

describe("public site", () => {
  it("never names how Pro is paid for", () => {
    const offenders = PUBLIC_ROOTS.flatMap(files).filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")))
    expect(offenders).toEqual([])
  })
})
