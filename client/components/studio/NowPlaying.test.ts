import { describe, expect, it } from "vitest"
import { upNext } from "./NowPlaying"

const queue = [
  { title: "One", artist: "A" },
  { title: "Two", artist: "B" },
  { title: "Three", artist: null },
]

describe("upNext", () => {
  it("names the first track while nothing has started, since Play starts it", () => {
    expect(upNext(queue, -1, "all")).toEqual({ text: "One — A", count: 3 })
    expect(upNext(queue.slice(0, 1), -1, "all")).toEqual({ text: "One — A", count: 1 })
  })

  it("names the following track mid-queue", () => {
    expect(upNext(queue, 0, "all")).toEqual({ text: "Two — B", count: 2 })
  })

  it("wraps to the top after the last track", () => {
    expect(upNext(queue, 2, "all")).toEqual({ text: "One — A (from the top)", count: 0 })
  })

  it("holds or loops a single track", () => {
    expect(upNext(queue, 1, "one").text).toBe("Holding this track")
    expect(upNext(queue.slice(0, 1), 0, "all").text).toBe("Looping this track")
  })

  it("asks for music on an empty queue", () => {
    expect(upNext([], -1, "all")).toEqual({ text: "Add music", count: 0 })
  })
})
