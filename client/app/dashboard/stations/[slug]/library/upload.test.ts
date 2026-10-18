import { describe, expect, it } from "vitest"
import { MAX_FILE_BYTES, partitionUploads, skippedFilesMessage, uploadErrorMessage } from "./upload"

const fail = (data: unknown) => ({ response: { data } })

describe("uploadErrorMessage", () => {
  it("reads Laravel's validation errors", () => {
    expect(uploadErrorMessage(fail({ errors: { "files.0": ["Too big."] } }))).toBe("Too big.")
  })

  it("reads the importer's per-file errors (the storage cap)", () => {
    const msg = uploadErrorMessage(fail({ data: [], errors: [{ index: 0, message: "Station storage limit reached." }] }))
    expect(msg).toBe("Station storage limit reached.")
  })

  it("falls back to the message, then to a default", () => {
    expect(uploadErrorMessage(fail({ message: "Nope." }))).toBe("Nope.")
    expect(uploadErrorMessage(new Error("network"))).toBe("Upload failed")
  })
})

describe("partitionUploads", () => {
  const file = (name: string, size: number, type = "") => {
    const f = new File([], name, { type })
    Object.defineProperty(f, "size", { value: size })
    return f
  }

  it("keeps audio up to the per-file limit and skips the rest", () => {
    const ok = file("song.mp3", 10)
    const edge = file("edge.wav", MAX_FILE_BYTES)
    const big = file("mix.mp3", MAX_FILE_BYTES + 1)
    const doc = file("notes.pdf", 10, "application/pdf")

    const { accepted, skipped } = partitionUploads([ok, big, edge, doc])
    expect(accepted).toEqual([ok, edge])
    expect(skipped).toEqual([big, doc])
  })

  it("names the first few skipped files in one message", () => {
    const names = ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"].map((n) => file(n, 1))
    expect(skippedFilesMessage(names.slice(0, 1))).toMatch(/^Skipped a\.pdf — /)
    expect(skippedFilesMessage(names)).toMatch(/^Skipped a\.pdf, b\.pdf, c\.pdf and 2 more — /)
  })
})
