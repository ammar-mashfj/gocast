import { describe, expect, it } from "vitest"
import { airState, type AirInput } from "./airState"
import type { StationStatus } from "@/interfaces/StationStatus"
import type { StudioSignal } from "@/components/studio/signal"

function status(over: Partial<StationStatus> = {}): StationStatus {
  return {
    slug: "night-shift",
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
    up_next: [],
    ...over,
  }
}

const signal = (over: Partial<StudioSignal>): StudioSignal => ({
  code: "live",
  tone: "live",
  label: "Live",
  detail: "Listeners hear you about 15–20 seconds after you speak.",
  ...over,
})

function input(over: Partial<AirInput> = {}): AirInput {
  return {
    status: status(),
    statusLoading: false,
    broadcastState: "idle",
    signal: null,
    micLatched: false,
    autoDjLocked: false,
    onStudio: false,
    ...over,
  }
}

describe("airState — from the poll", () => {
  it("says checking until the first read, then no answer if it failed", () => {
    expect(airState(input({ status: null, statusLoading: true }))).toMatchObject({ label: "CHECKING", tone: "off", action: null })
    expect(airState(input({ status: null, statusLoading: false }))).toMatchObject({ label: "NO ANSWER", action: null })
  })

  it("offers Start AutoDJ off air, or Go live when the plan has no AutoDJ", () => {
    const off = status({ state: "offline", reachable: false, source: null, now_playing: null })
    expect(airState(input({ status: off }))).toMatchObject({ tone: "off", label: "OFF AIR", action: "start-autodj", onAir: false })
    expect(airState(input({ status: off, autoDjLocked: true }))).toMatchObject({ action: "go-live" })
  })

  it("names the AutoDJ track and offers Go live", () => {
    expect(airState(input())).toMatchObject({
      tone: "onair",
      label: "ON AIR · AUTODJ",
      message: "AutoDJ is playing Neon Rain by Koto Blue.",
      action: "go-live",
      onAir: true,
    })
    expect(airState(input({ status: status({ now_playing: null }) })).message).toBe("AutoDJ is playing.")
  })

  it("warns when AutoDJ has nothing to play", () => {
    expect(airState(input({ status: status({ source: "silence", now_playing: null }) }))).toMatchObject({
      tone: "warn",
      label: "SILENCE",
      action: "add-tracks",
    })
  })

  it("warns when the station runs but nobody can hear it", () => {
    expect(airState(input({ status: status({ state: "degraded" }) }))).toMatchObject({ tone: "warn", label: "NOT HEARD" })
  })

  it("says starting while the container boots", () => {
    expect(airState(input({ status: status({ state: "starting", reachable: false }) }))).toMatchObject({ label: "STARTING", action: null })
  })

  it("shows a broadcaster from elsewhere as live, with no transport", () => {
    const s = status({ state: "live", source: "live", broadcaster: true, live_source: { type: "external", client: "BUTT" } })
    expect(airState(input({ status: s }))).toMatchObject({
      tone: "live",
      label: "LIVE",
      message: "You’re live from your DJ software.",
      broadcasting: false,
      action: null,
    })
  })

  it("trusts the open session when the container predates `broadcaster`", () => {
    const s = status({ state: "live", broadcaster: null, live_source: { type: "browser", client: null } })
    expect(airState(input({ status: s })).message).toBe("You’re live from another browser.")
  })
})

describe("airState — this tab is broadcasting", () => {
  const live = { broadcastState: "live" as const }

  it("outranks the poll", () => {
    const r = airState(input({ ...live, status: status({ state: "offline" }), signal: signal({}) }))
    expect(r).toMatchObject({ tone: "live", label: "LIVE", broadcasting: true, action: "open-studio" })
  })

  it("has no button on the studio page", () => {
    expect(airState(input({ ...live, signal: signal({}), onStudio: true })).action).toBeNull()
  })

  it("turns solid red with the mic open, and offers Close mic only when latched", () => {
    const mic = signal({ code: "mic", tone: "mic", label: "Live · Mic", detail: "You’re talking." })
    expect(airState(input({ ...live, signal: mic }))).toMatchObject({ tone: "mic", label: "LIVE · MIC", action: "open-studio" })
    expect(airState(input({ ...live, signal: mic, micLatched: true })).action).toBe("close-mic")
    expect(airState(input({ ...live, signal: mic, micLatched: true, onStudio: true })).action).toBe("close-mic")
  })

  it("turns amber on a fault, with the signal's own words", () => {
    const silence = signal({ code: "silence", tone: "fault", label: "Silence", detail: "Nothing is going out." })
    expect(airState(input({ ...live, signal: silence }))).toMatchObject({ tone: "warn", label: "SILENCE", message: "Nothing is going out." })
  })

  it("treats reconnecting as broadcasting", () => {
    const rec = signal({ code: "reconnecting", tone: "fault", label: "Reconnecting", detail: "Nothing is reaching listeners." })
    expect(airState(input({ broadcastState: "reconnecting", signal: rec }))).toMatchObject({ tone: "warn", label: "RECONNECTING", broadcasting: true })
  })
})
