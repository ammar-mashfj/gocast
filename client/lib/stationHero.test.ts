import { describe, expect, it } from "vitest"
import { stationHero, type HeroInput } from "./stationHero"
import type { StationStatus } from "@/interfaces/StationStatus"

function status(over: Partial<StationStatus> = {}): StationStatus {
  return {
    slug: "night",
    state: "on_air",
    desired_state: "running",
    started_at: null,
    reachable: true,
    ready: true,
    icecast_connected: true,
    last_ready_at: null,
    source: "autodj",
    broadcaster: false,
    live_source: null,
    now_playing: { title: "Neon Rain", artist: "Koto Blue" },
    elapsed: 10,
    remaining: 100,
    playlist_length: 12,
    up_next: [{ id: "2", title: "Afterglow", artist: "The Low Tides" }],
    ...over,
  }
}

function input(over: Partial<HeroInput> = {}): HeroInput {
  return {
    stationState: "on_air",
    status: status(),
    loading: false,
    slow: false,
    liveFromThisBrowser: false,
    autoDjLocked: false,
    lastNowPlaying: null,
    playlistName: "Main rotation",
    ...over,
  }
}

const offline = status({ state: "offline", reachable: false, source: null, now_playing: null, up_next: [], playlist_length: null })

describe("stationHero — off air", () => {
  it("offers Go live then Start AutoDJ", () => {
    const h = stationHero(input({ stationState: "offline", status: offline }))
    expect(h).toMatchObject({ tone: "off", label: "OFF AIR", actions: ["go-live", "start-autodj"], nowPlaying: null })
    expect(h.text).toContain("Start AutoDJ")
  })

  it("offers only Go live on a plan without AutoDJ", () => {
    const h = stationHero(input({ stationState: "offline", status: offline, autoDjLocked: true }))
    expect(h.actions).toEqual(["go-live"])
    expect(h.text).not.toContain("AutoDJ")
  })
})

describe("stationHero — AutoDJ", () => {
  it("names the playlist, shows the track with progress and what's next", () => {
    const h = stationHero(input())
    expect(h).toMatchObject({ tone: "onair", label: "ON AIR · AUTODJ", source: "AutoDJ", actions: ["go-live", "stop"] })
    expect(h.text).toContain("Main rotation")
    expect(h.nowPlaying).toEqual({
      track: { title: "Neon Rain", artist: "Koto Blue" },
      line: null,
      progress: true,
      next: "Afterglow · The Low Tides",
    })
  })

  it("asks before Stop AutoDJ cuts listeners off", () => {
    expect(stationHero(input()).stop).toEqual({ label: "Stop AutoDJ", confirm: true })
  })

  it("holds the last title across the gap between tracks", () => {
    const h = stationHero(input({ status: status({ now_playing: null }), lastNowPlaying: { title: "Neon Rain", artist: null } }))
    expect(h.nowPlaying?.track?.title).toBe("Neon Rain")
  })

  it("says silence in amber, with no confirm to stop", () => {
    const h = stationHero(input({ status: status({ source: "silence", now_playing: null, playlist_length: 0 }) }))
    expect(h).toMatchObject({ tone: "caution", label: "NO SOUND", stop: { label: "Turn station off", confirm: false } })
  })
})

describe("stationHero — live", () => {
  it("from this tab: You're live, Open studio, no stop", () => {
    const h = stationHero(input({ status: status({ state: "live", source: "live", broadcaster: true }), liveFromThisBrowser: true }))
    expect(h).toMatchObject({ tone: "live", label: "LIVE", title: "You’re live.", source: "Live from this browser", actions: ["open-studio"] })
  })

  it("from DJ software: names it, offers to listen, keeps the stop (the cut-off path)", () => {
    const s = status({ state: "live", source: "live", broadcaster: true, live_source: { type: "external", client: "Mixxx 2.5" } })
    const h = stationHero(input({ status: s }))
    expect(h).toMatchObject({ title: "You’re live from Mixxx 2.5.", source: "Live from Mixxx 2.5", actions: ["hear-stream", "stop"] })
    expect(h.text).toBe("Stop broadcasting in Mixxx 2.5 to end the show.")
  })

  it("from another browser: listen only — that show ends in its own studio", () => {
    const s = status({ state: "live", source: "live", broadcaster: true, live_source: { type: "browser", client: null } })
    expect(stationHero(input({ status: s })).actions).toEqual(["hear-stream"])
  })

  it("offers no lead action until the first poll says which source is live", () => {
    const h = stationHero(input({ stationState: "live", status: null, loading: true }))
    expect(h.actions).toEqual(["stop"])
    expect(h.stopDisabled).toBe(true)
  })

  it("says the takeover is seconds away while harbor buffers", () => {
    const h = stationHero(input({ status: status({ broadcaster: true, source: "autodj" }), liveFromThisBrowser: true }))
    expect(h.text).toBe("Going on air in a few seconds.")
  })

  it("does not call the drain of an ended show live", () => {
    const h = stationHero(input({ status: status({ source: "live", broadcaster: false, now_playing: { title: "Live", artist: null } }) }))
    expect(h).toMatchObject({ headline: "on_air", title: "Your show has ended.", source: "Handing back to AutoDJ" })
    expect(h.nowPlaying?.line).toBe("Handing back to AutoDJ soon…")
  })
})

describe("stationHero — in between", () => {
  it("checks, then admits it can't reach the station", () => {
    expect(stationHero(input({ status: null, loading: true })).label).toBe("CHECKING")
    expect(stationHero(input({ status: null, loading: true, slow: true })).label).toBe("STATUS UNKNOWN")
  })

  it("disables Go live and stop until a running station's status is known", () => {
    const h = stationHero(input({ status: null, loading: true }))
    expect(h.goLiveDisabled).toBe(true)
    expect(h.stopDisabled).toBe(true)
  })

  it("puts a degraded station in amber", () => {
    expect(stationHero(input({ status: status({ state: "degraded" }) }))).toMatchObject({ tone: "caution", label: "NOT REACHING LISTENERS" })
  })
})
