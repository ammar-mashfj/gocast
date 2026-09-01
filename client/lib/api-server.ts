import { cookies } from "next/headers"

const API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL!

/** Error thrown by {@link apiFetch} when the backend returns a non-2xx response. */
export class ApiFetchError extends Error {
  constructor(public status: number, public path: string, public body?: string) {
    super(`API error ${status} on ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`)
    this.name = "ApiFetchError"
  }
}

/** Default budget for a single server-side API call. */
const TIMEOUT_MS = 10_000

/**
 * Error thrown by {@link apiFetch} when the request did not complete in time,
 * or the caller's own signal aborted it.
 *
 * This exists to replace the DOMException that `AbortSignal.timeout()` rejects
 * with, which must never escape into a Server Component. `DOMException.message`
 * is an accessor with no setter, and React's RSC error plumbing assigns to
 * `.message` while ferrying an error across the server boundary — so the real
 * failure was being swallowed and re-thrown as an unhandled
 * `TypeError: Cannot set property message of #<DOMException> which has only a
 * getter`, with a stack pointing into React's deserializer rather than at the
 * call that timed out. A plain Error subclass carries the same information and
 * survives the trip.
 */
export class ApiTimeoutError extends Error {
  constructor(public path: string, public timeoutMs: number, options?: { cause?: unknown }) {
    super(`API request to ${path} timed out after ${timeoutMs}ms`, options)
    this.name = "ApiTimeoutError"
  }
}

/** Did this rejection come from an abort (ours or the caller's)? */
function isAbort(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  )
}

/**
 * Server-side fetch helper that reads auth tokens from cookies.
 * Used in Server Components and Route Handlers where the client-side
 * Axios instance is unavailable. Automatically attaches the Bearer token
 * and enforces a {@link TIMEOUT_MS} timeout, surfaced as an
 * {@link ApiTimeoutError} rather than a raw DOMException.
 *
 * Always uncached — relies on the calling server component being dynamic
 * (which it already is via `cookies()`). Server components that render
 * user-specific data must never be cached across sessions.
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value

  let res: Response

  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    })
  } catch (err) {
    // Translate the DOMException before it reaches a Server Component — see
    // ApiTimeoutError. `cause` keeps the original for anyone debugging.
    if (isAbort(err)) {
      throw new ApiTimeoutError(path, TIMEOUT_MS, { cause: err })
    }

    throw err
  }

  if (!res.ok) {
    const body = await res.text().catch(() => undefined)
    throw new ApiFetchError(res.status, path, body)
  }

  return res.json()
}
