import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BroadcastManager } from "./broadcast"

/** Enough of a WebSocket for openSocket: the test drives every event. */
class FakeSocket {
  static last: FakeSocket | null = null
  binaryType = ""
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((message: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  constructor() {
    FakeSocket.last = this
  }
  send(data: string) {
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
  return manager as unknown as { openSocket: (url: string, token: string) => Promise<unknown> }
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
})
