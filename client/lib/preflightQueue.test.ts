import { describe, expect, it } from "vitest"
import { fitFiles, queueMeta, removeTrack, type PreflightTrack } from "./preflightQueue"

const t = (id: string, duration = 60): PreflightTrack => ({ id, file: new File([], `${id}.mp3`), title: id, artist: "", duration })
const ids = (tracks: PreflightTrack[]) => tracks.map((x) => x.id)

describe("removeTrack", () => {
  const tracks = [t("a"), t("b"), t("c"), t("d")]

  it("keeps the saved spot on the same song when an earlier one goes", () => {
    const r = removeTrack(tracks, { currentIndex: 2, offset: 41 }, "a")
    expect(ids(r.tracks)).toEqual(["b", "c", "d"])
    expect(r.playback).toEqual({ currentIndex: 1, offset: 41 })
  })

  it("starts the next song from 0:00 when the saved one goes", () => {
    expect(removeTrack(tracks, { currentIndex: 2, offset: 41 }, "c").playback).toEqual({ currentIndex: 2, offset: 0 })
    expect(removeTrack(tracks, { currentIndex: 3, offset: 41 }, "d").playback).toEqual({ currentIndex: 2, offset: 0 })
  })

  it("leaves the spot alone when a later song goes", () => {
    expect(removeTrack(tracks, { currentIndex: 1, offset: 5 }, "d").playback).toEqual({ currentIndex: 1, offset: 5 })
  })

  it("drops the spot with the last song, and ignores unknown ids", () => {
    expect(removeTrack([t("a")], { currentIndex: 0, offset: 5 }, "a")).toEqual({ tracks: [], playback: null })
    expect(removeTrack(tracks, null, "zz").tracks).toBe(tracks)
  })
})

describe("fitFiles", () => {
  it("keeps files in order until the limit, skipping what doesn't fit", () => {
    const r = fitFiles([{ size: 40 }, { size: 70 }, { size: 20 }], 30, 100)
    expect(r.fit.map((f) => f.size)).toEqual([40, 20])
    expect(r.skipped.map((f) => f.size)).toEqual([70])
  })
})

describe("queueMeta", () => {
  it("counts and totals", () => {
    expect(queueMeta([])).toBe("Empty")
    expect(queueMeta([t("a", 180)])).toBe("1 track · 3m 0s")
    expect(queueMeta([t("a", 1800), t("b", 1818)])).toBe("2 tracks · 1h 0m")
    expect(queueMeta([t("a", 0), t("b", 0)])).toBe("2 tracks")
  })
})
