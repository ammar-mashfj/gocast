import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BroadcastManager } from "./broadcast"

const api = vi.hoisted(() => ({
  desiredState: "running" as "running" | "stopped" | "deleted",
  posts: [] as string[],
}))
vi.mock("./axios", () => ({
  default: {
    get: async () => {
      if (api.desiredState === "deleted") throw Object.assign(new Error("Not Found"), { response: { status: 404 } })
      return { data: { data: { desired_state: api.desiredState, ready: true } } }
    },
    post: async (url: string) => {
      api.posts.push(url)
      return { data: {} }
    },
  },
}))
vi.mock("./studioDropLog", () => ({ captureDrop: () => "drop", flushDrops: () => {}, resolveDrop: () => {} }))

/** Enough of a WebSocket for openSocket: the test drives every event. */
class FakeSocket {
  static last: FakeSocket | null = null
  static OPEN = 1
  binaryType = ""
  readyState = 0
  bufferedAmount = 0
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((message: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  constructor() {
    FakeSocket.last = this
  }
  send(data: unknown) {
    this.sent.push(data)
  }
  close() {}
}

function relayManager() {
  const manager = new BroadcastManager("night-show", {
    onStepChange: () => {},
    onStateChange: () => {},
    onError: () => {},
  })
  // Private: the path is normally chosen by the broadcast-token reply.
  ;(manager as unknown as { ingest: string }).ingest = "relay"
  return manager as unknown as {
    openSocket: (url: string, token: string) => Promise<unknown>
    handleChunk: (chunk: ArrayBuffer) => void
    sendMetadata: (title: string, artist: string) => void
  }
}

describe("openSocket on the relay", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("WebSocket", FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // The relay gives Icecast up to 10s to admit the source, and the studio
  // waits 12s for its "ok". The 10s connect timer used to keep running after
  // the socket opened, so a slow admit always failed as a timeout.
  it("waits for a slow Icecast admit past the connect timeout", async () => {
    const opened = relayManager().openSocket("wss://relay.test/relay", "token")
    const socket = FakeSocket.last!

    vi.advanceTimersByTime(500)
    socket.onopen!()
    vi.advanceTimersByTime(11_000)
    socket.onmessage!({ data: JSON.stringify({ type: "ok" }) })

    await expect(opened).resolves.toBe(socket)
  })

  it("still gives up when the relay never answers", async () => {
    const opened = relayManager().openSocket("wss://relay.test/relay", "token")
    const failed = expect(opened).rejects.toThrow("did not answer")

    FakeSocket.last!.onopen!()
    vi.advanceTimersByTime(12_000)

    await failed
  })

  it("still times out a socket that never opens", async () => {
    const opened = relayManager().openSocket("wss://relay.test/relay", "token")
    const failed = expect(opened).rejects.toThrow("Timed out connecting")

    vi.advanceTimersByTime(10_000)

    await failed
  })

  // The relay reads nothing until Icecast admits the source, so audio sent
  // before then reaches Icecast in one burst and leaves listeners behind.
  it("sends no audio until the relay says ok", async () => {
    const manager = relayManager()
    const opened = manager.openSocket("wss://relay.test/relay", "token")
    const socket = FakeSocket.last!
    socket.readyState = 1
    socket.onopen!()

    manager.handleChunk(new ArrayBuffer(8))
    expect(socket.sent.filter((data) => data instanceof ArrayBuffer)).toHaveLength(0)

    socket.onmessage!({ data: JSON.stringify({ type: "ok" }) })
    await opened
    manager.handleChunk(new ArrayBuffer(8))
    expect(socket.sent.filter((data) => data instanceof ArrayBuffer)).toHaveLength(1)
  })
  it("explains a relay draining for a deploy in the relay's words, not harbor's", async () => {
    const opened = relayManager().openSocket("wss://relay.test/relay", "token")
    const socket = FakeSocket.last!
    socket.readyState = 1
    socket.onopen!()
    socket.onclose!({ code: 1001 })
    await expect(opened).rejects.toThrow("The stream server is restarting")
  })

  it("holds a title until the relay says ok, then sends it once", async () => {
    api.posts = []
    const manager = relayManager()
    const opened = manager.openSocket("wss://relay.test/relay", "token")
    const socket = FakeSocket.last!
    socket.readyState = 1
    socket.onopen!()

    manager.sendMetadata("First", "Artist")
    expect(api.posts).toHaveLength(0)

    socket.onmessage!({ data: JSON.stringify({ type: "ok" }) })
    await opened
    expect(api.posts).toEqual(["/stations/night-show/now-playing"])
  })
})

describe("a relay source cut on the server (4005)", () => {
  beforeEach(() => {
    api.posts = []
    vi.stubGlobal("WebSocket", FakeSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function liveOnRelay() {
    const errors: string[] = []
    const manager = new BroadcastManager("night-show", {
      onStepChange: () => {},
      onStateChange: () => {},
      onError: (message: string) => errors.push(message),
    })
    const internals = manager as unknown as {
      ingest: string
      established: boolean
      socketBytes: number
      ws: unknown
      watchForDrop: (ws: unknown) => void
    }
    internals.ingest = "relay"
    internals.established = true
    internals.socketBytes = 1
    const socket = new FakeSocket()
    internals.ws = socket
    internals.watchForDrop(socket)
    return { socket, errors }
  }

  // Turning the station off cuts the source. A reconnect would POST /start
  // and switch it back on.
  it("ends the show when the station was turned off", async () => {
    api.desiredState = "stopped"
    const { socket, errors } = liveOnRelay()

    socket.onclose!({ code: 4005 })
    await vi.waitFor(() => expect(errors).toContain("The station was turned off, so the broadcast ended."))

    expect(api.posts).toEqual([])
  })

  // Deleting a station cuts its source, and its status is a 404 from then on.
  // Reconnecting would only fail on start and token until the budget ran out.
  it("ends the show when the station was deleted", async () => {
    api.desiredState = "deleted"
    const { socket, errors } = liveOnRelay()

    socket.onclose!({ code: 4005 })
    await vi.waitFor(() => expect(errors).toContain("This station was deleted, so the broadcast ended."))

    expect(api.posts).toEqual([])
    api.desiredState = "running"
  })

  // Icecast restarting cuts the source too; that one is ridden out.
  it("reconnects when the station is still on", async () => {
    vi.useFakeTimers()
    api.desiredState = "running"
    const { socket } = liveOnRelay()

    socket.onclose!({ code: 4005 })
    await vi.advanceTimersByTimeAsync(5_000)

    expect(api.posts).toContain("/stations/night-show/start")
    vi.useRealTimers()
  })
})
