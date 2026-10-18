import { afterEach, describe, expect, it, vi } from "vitest"
import { AxiosError } from "axios"

const post = vi.fn()
vi.mock("./axios", () => ({ default: { post: (...a: unknown[]) => post(...a) } }))

import { UPLINK_CHECK_FAILED, UPLINK_CHECK_THROTTLED, measureUplink } from "./uplinkProbe"

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

  it("says to wait, not to check you're online, when the probe is rate limited", async () => {
    const throttled = new AxiosError("Too Many Requests", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 429,
    } as never)
    post.mockRejectedValueOnce(throttled)

    await expect(measureUplink()).rejects.toThrow(UPLINK_CHECK_THROTTLED)
  })

  it("still says to check you're online when the request never got an answer", async () => {
    post.mockRejectedValueOnce(new AxiosError("Network Error", "ERR_NETWORK"))

    await expect(measureUplink()).rejects.toThrow(UPLINK_CHECK_FAILED)
  })
})
