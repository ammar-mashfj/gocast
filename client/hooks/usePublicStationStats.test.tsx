import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePublicStationStats } from "./usePublicStationStats"
import { useListenerCount } from "./useListenerCount"

vi.mock("@/lib/env", () => ({ env: { apiUrl: "https://api.test" } }))
vi.mock("@/lib/cookies", () => ({ getCookie: (name: string) => (name === "token" ? "tok" : null) }))

function respondWith(byUrl: Record<string, number | null>) {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { count: byUrl[url] ?? null, is_on_air: true } }),
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe("listener feeds", () => {
  it("gives the owner's screens the count even when the public feed hides it", async () => {
    const fetchMock = respondWith({
      "https://api.test/public/stations/jazz/listeners": null,
      "https://api.test/stations/jazz/listeners": 12,
    })

    const { result } = renderHook(() => useListenerCount("jazz"))
    await waitFor(() => expect(result.current).toBe(12))

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.test/stations/jazz/listeners")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok")
  })

  it("keeps the public player on the public endpoint, in its own feed", async () => {
    const fetchMock = respondWith({
      "https://api.test/public/stations/blues/listeners": null,
      "https://api.test/stations/blues/listeners": 12,
    })

    const { result } = renderHook(() => ({
      pub: usePublicStationStats("blues"),
      owner: useListenerCount("blues"),
    }))
    await waitFor(() => expect(result.current.owner).toBe(12))
    await waitFor(() => expect(result.current.pub).not.toBeNull())

    expect(result.current.pub!.count).toBeNull()
    const urls = fetchMock.mock.calls.map((call) => call[0])
    expect(urls).toContain("https://api.test/public/stations/blues/listeners")
    expect(urls).toContain("https://api.test/stations/blues/listeners")
  })
})
