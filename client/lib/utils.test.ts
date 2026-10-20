import { describe, expect, it } from "vitest"
import { cn } from "./utils"

// The dashboard's type, radius and surface tokens (app/dashboard.css) are
// names tailwind-merge doesn't know; these pin the registration in utils.ts.
describe("cn", () => {
  it("keeps a type token next to a colour", () => {
    expect(cn("text-display", "text-foreground")).toBe("text-display text-foreground")
    expect(cn("text-meter", "text-live")).toBe("text-meter text-live")
    expect(cn("eyebrow", "text-muted-foreground")).toBe("eyebrow text-muted-foreground")
  })

  it("lets a later type token replace an earlier size", () => {
    expect(cn("text-sm", "text-display")).toBe("text-display")
    expect(cn("text-display", "text-heading")).toBe("text-heading")
    expect(cn("eyebrow", "text-caption")).toBe("text-caption")
  })

  it("merges radius and surface tokens with the defaults", () => {
    expect(cn("rounded-lg", "rounded-card")).toBe("rounded-card")
    expect(cn("rounded-card", "rounded-full")).toBe("rounded-full")
    expect(cn("bg-card", "bg-surface-raised")).toBe("bg-surface-raised")
  })
})
