import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isStaleBuildError, reloadOnceForStaleBuild } from "./staleBuild"

function chunkError(message = "Failed to load chunk /_next/static/chunks/05rpfj8jcwibw.js from module 964893") {
  const error = new Error(message)
  error.name = "ChunkLoadError"
  return error
}

describe("isStaleBuildError", () => {
  it("knows the bundlers' and browsers' missing-chunk errors", () => {
    expect(isStaleBuildError(chunkError())).toBe(true)
    expect(isStaleBuildError(new Error("Loading chunk 123 failed."))).toBe(true)
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true)
    expect(isStaleBuildError(new TypeError("error loading dynamically imported module: https://x/a.js"))).toBe(true)
  })

  it("leaves other errors to the error page", () => {
    expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(isStaleBuildError("Failed to load chunk")).toBe(false)
  })
})

describe("reloadOnceForStaleBuild", () => {
  const reload = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal("location", { ...window.location, reload })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    reload.mockReset()
    vi.useRealTimers()
  })

  it("reloads on a stale chunk", () => {
    expect(reloadOnceForStaleBuild(chunkError())).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("doesn't reload for an ordinary error", () => {
    expect(reloadOnceForStaleBuild(new Error("boom"))).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it("doesn't loop while the deploy is still running, and tries again later", () => {
    vi.useFakeTimers()
    expect(reloadOnceForStaleBuild(chunkError())).toBe(true)
    expect(reloadOnceForStaleBuild(chunkError())).toBe(false)
    vi.advanceTimersByTime(31_000)
    expect(reloadOnceForStaleBuild(chunkError())).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
