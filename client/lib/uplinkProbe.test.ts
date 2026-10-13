import { afterEach, describe, expect, it, vi } from "vitest"
import { AxiosError } from "axios"

const post = vi.fn()
vi.mock("./axios", () => ({ default: { post: (...a: unknown[]) => post(...a) } }))

import { measureUplink } from "./uplinkProbe"

describe("measureUplink", () => {
  afterEach(() => {
    post.mockReset()
    vi.restoreAllMocks()
  })

  it("gives the upload its full transfer time on top of a slow line's overhead", async () => {
    // Warm-up, then a timed empty request taking 2s: a high-latency line.
    const clock = [0, 0, 0, 2000, 0]
    vi.spyOn(performance, "now").mockImplementation(() => clock.shift() ?? 0)
    post
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new AxiosError("timeout", "ECONNABORTED"))

    await measureUplink()

    expect(post.mock.calls[2][2]).toMatchObject({ timeout: 12000 })
  })
})
