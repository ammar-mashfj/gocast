import { describe, expect, it } from "vitest"
import { activeNav, pageLabel } from "./dashboardNav"

describe("activeNav", () => {
  it.each([
    ["/dashboard", "overview"],
    ["/dashboard/stations/night", "overview"],
    ["/dashboard/stations/night/live", "studio"],
    ["/dashboard/stations/night/studio", "studio"],
    ["/dashboard/stations/night/library", "autodj"],
    ["/dashboard/stations/night/library/playlists/3", "autodj"],
    ["/dashboard/library", "autodj"],
    ["/dashboard/stations/night/schedule", "schedule"],
    ["/dashboard/stations/night/audience", "audience"],
    ["/dashboard/stations/night/settings", "settings"],
    ["/dashboard/broadcasts", "shows"],
    ["/dashboard/settings", null],
  ])("%s → %s", (path, key) => {
    expect(activeNav(path)).toBe(key)
  })
})

describe("pageLabel", () => {
  it("is empty on the overview, where the station name is the crumb", () => {
    expect(pageLabel("/dashboard/stations/night")).toBeNull()
  })

  it("names station pages and the account page", () => {
    expect(pageLabel("/dashboard/stations/night/live")).toBe("Studio")
    expect(pageLabel("/dashboard/stations/night/library")).toBe("AutoDJ")
    expect(pageLabel("/dashboard/broadcasts")).toBe("Your shows")
    expect(pageLabel("/dashboard/settings")).toBe("Account")
  })
})
