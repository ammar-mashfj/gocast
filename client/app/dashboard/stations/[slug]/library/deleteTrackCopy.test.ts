import { describe, expect, it } from "vitest"
import { deleteTrackDescription } from "./deleteTrackCopy"

describe("deleteTrackDescription", () => {
  it("says when the track is in no playlist", () => {
    expect(deleteTrackDescription(0)).toBe("It isn't in any playlist. This can't be undone.")
  })

  it("uses the singular for one playlist", () => {
    expect(deleteTrackDescription(1)).toBe("It's in 1 playlist and will be taken out of it. This can't be undone.")
  })

  it("names the count for several playlists", () => {
    expect(deleteTrackDescription(3)).toBe("It's in 3 playlists and will be taken out of all of them. This can't be undone.")
  })
})
