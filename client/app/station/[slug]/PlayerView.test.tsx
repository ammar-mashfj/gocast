import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { PublicStationStats } from "@/hooks/usePublicStationStats"
import type { Station } from "@/interfaces/Station"
import { PlayerView } from "./PlayerView"

type Handler = (event: string, data: unknown) => void
const hls = vi.hoisted(() => ({ last: null as null | { handlers: Map<string, Handler>; src: string | null } }))

vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: "parsed", ERROR: "error", LEVEL_LOADED: "level", DESTROYING: "destroying" }
    static ErrorTypes = { NETWORK_ERROR: "net", MEDIA_ERROR: "media", OTHER_ERROR: "other" }
    handlers = new Map<string, Handler>()
    src: string | null = null
    constructor() {
      hls.last = this
    }
    on(event: string, handler: Handler) {
      if (event === "error") this.handlers.set(event, handler)
    }
    loadSource(src: string) {
      this.src = src
    }
    attachMedia() {}
    startLoad() {}
    destroy() {}
  }
  return { default: FakeHls }
})
vi.mock("@/lib/env", () => ({ env: { icecastUrl: "https://icecast.test", siteUrl: "https://site.test" } }))
vi.mock("@/lib/hlsPlaylistLoader", () => ({ createPlaylistLoader: () => undefined }))
vi.mock("@/hooks/useListenerSession", () => ({ useListenerSession: () => {} }))
vi.mock("@/hooks/useDocumentTitle", () => ({ useDocumentTitle: () => {} }))
vi.mock("@/lib/listenerLibrary", () => ({
  isSaved: () => false,
  toggleSaved: () => {},
  recordListen: () => {},
  subscribeLibrary: () => () => {},
}))

let feed: ((next: PublicStationStats) => void) | null = null
vi.mock("@/hooks/usePublicStationStats", () => ({
  usePublicStationFeed: (_slug: string, onStats: (next: PublicStationStats) => void) => {
    feed = onStats
  },
}))

// A cached render from an earlier run that had a container: it carries an
// HLS URL, and this run is on the relay.
const station = {
  slug: "night-show",
  name: "Night Show",
  icecast_mount: "/stream/night-show",
  hls_url: "https://hls.test/night-show/aac.m3u8",
  is_on_air: true,
  is_live: false,
} as unknown as Station

function stats(overrides: Partial<PublicStationStats>): PublicStationStats {
  return {
    count: 0,
    is_live: true,
    is_on_air: true,
    state: "online",
    icecast_only: true,
    switched_off: false,
    now_playing: { title: null, artist: null },
    ...overrides,
  } as PublicStationStats
}

describe("PlayerView on a relay run it was not rendered for", () => {
  beforeEach(() => {
    feed = null
    hls.last = null
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
    // jsdom has no text tracks; the in-band metadata watcher needs the list.
    Object.defineProperty(HTMLMediaElement.prototype, "textTracks", {
      configurable: true,
      get: () => Object.assign([], { addEventListener() {}, removeEventListener() {} }),
    })
  })

  it("goes to Icecast on the first missing playlist once the feed says relay", () => {
    render(<PlayerView station={station} />)
    fireEvent.click(screen.getAllByRole("button", { name: /play/i })[0])
    expect(hls.last?.src).toBe("https://hls.test/night-show/aac.m3u8")

    act(() => feed!(stats({})))
    act(() => hls.last!.handlers.get("error")!("error", { fatal: true, type: "net", response: { code: 404 } }))

    expect(document.querySelector("audio")!.getAttribute("src")).toBe("https://icecast.test/stream/night-show")
  })
})
