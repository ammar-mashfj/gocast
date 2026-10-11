import { describe, expect, it } from "vitest"
import type { Plan } from "@/interfaces/Plan"
import { planIncludes } from "./PlanCard"

const plan = (over: Partial<Plan>): Plan => ({
  slug: "pro",
  name: "Pro",
  autodj_enabled: true,
  analytics_days: 90,
  max_listeners: 1000,
  embed_enabled: true,
  encoder_enabled: true,
  watermarked: false,
  expires_at: null,
  ...over,
})

describe("planIncludes", () => {
  it("lists what the plan's own flags turn on", () => {
    expect(planIncludes(plan({}))).toBe("Up to 1,000 listeners at once, AutoDJ, embeds, your own DJ software and 90 days of audience history.")
  })

  it("says only the listener cap when nothing else is on", () => {
    expect(planIncludes(plan({ slug: "free", max_listeners: 50, autodj_enabled: false, analytics_days: 0, embed_enabled: false, encoder_enabled: false }))).toBe(
      "Up to 50 listeners at once.",
    )
  })
})
