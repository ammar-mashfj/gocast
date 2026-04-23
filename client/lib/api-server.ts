import { cookies } from "next/headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL!

/** Error thrown by {@link apiFetch} when the backend returns a non-2xx response. */
export class ApiFetchError extends Error {
  constructor(public status: number, public path: string, public body?: string) {
    super(`API error ${status} on ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`)
    this.name = "ApiFetchError"
  }
}

/**
 * Server-side fetch helper that reads auth tokens from cookies.
 * Used in Server Components and Route Handlers where the client-side
 * Axios instance is unavailable. Automatically attaches the Bearer token
 * and enforces a 10-second timeout.
 *
 * Always uncached — relies on the calling server component being dynamic
 * (which it already is via `cookies()`). Server components that render
 * user-specific data must never be cached across sessions.
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value

  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => undefined)
    throw new ApiFetchError(res.status, path, body)
  }

  return res.json()
}
