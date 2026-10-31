import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { PublicStationStats } from "@/hooks/usePublicStationStats"
import type { Station } from "@/interfaces/Station"
import { HeroStationPlayer } from "./HeroStationPlayer"

// The Icecast path: no Media Source, no native HLS.
vi.mock("hls.js", () => ({ default: { isSupported: () => false } }))
vi.mock("@/lib/env", () => ({ env: { icecastUrl: "https://icecast.test" } }))
vi.mock("@/hooks/useListenerSession", () => ({ useListenerSession: () => {} }))

let feed: ((next: PublicStationStats) => void) | null = null
vi.mock("@/hooks/usePublicStationStats", () => ({
  usePublicStationFeed: (_slug: string, onStats: (next: PublicStationStats) => void) => {
    feed = onStats
  },
}))

const station = {
  slug: "night-show",
  name: "Night Show",
  icecast_mount: "/stream/night-show",
  hls_url: null,
  is_on_air: true,
} as unknown as Station

function stats(overrides: Partial<PublicStationStats>): PublicStationStats {
  return {
    count: 1,
    is_live: false,
    is_on_air: true,
    state: "online",
    icecast_only: true,
    switched_off: false,
    now_playing: { title: null, artist: null },
    ...overrides,
  } as PublicStationStats
}

describe("HeroStationPlayer", () => {
  beforeEach(() => {
    feed = null
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
  })

  function startPlaying() {
    render(<HeroStationPlayer station={station} />)
    fireEvent.click(screen.getByRole("button", { name: "Play Night Show" }))
    const audio = document.querySelector("audio")!
    fireEvent.playing(audio)
    expect(audio.getAttribute("src")).toBe("https://icecast.test/stream/night-show")
    return audio
  }

  // Icecast moves a switched-off station's listeners to the shared silence
  // mount instead of ending the stream, so no error ever stops the player.
  it("stops when the owner switches the station off", () => {
    const audio = startPlaying()

    act(() => feed!(stats({ switched_off: true, is_on_air: false, state: "offline" })))

    expect(audio.getAttribute("src")).toBeNull()
    expect(screen.getByRole("button", { name: "Play Night Show" })).toBeInTheDocument()
  })

  // A container being recreated reads offline too; that is a blip to ride out.
  it("keeps playing through an offline reading the owner did not cause", () => {
    const audio = startPlaying()

    act(() => feed!(stats({ switched_off: false, is_on_air: false, state: "offline" })))

    expect(audio.getAttribute("src")).toBe("https://icecast.test/stream/night-show")
    expect(screen.getByRole("button", { name: "Pause Night Show" })).toBeInTheDocument()
  })
})
