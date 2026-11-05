import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BroadcastManager } from "./broadcast"

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
})
