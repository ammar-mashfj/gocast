import { cookies } from "next/headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL!

/**
 * Server-side fetch helper that reads auth tokens from cookies.
 * Used in Server Components and Route Handlers where the client-side
 * Axios instance is unavailable. Automatically attaches the Bearer token
 * and enforces a 10-second timeout.
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value

  const res = await fetch(`${API_URL}${path}`, {
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
    throw new Error(`API error ${res.status} on ${path}`)
  }

  return res.json()
}
