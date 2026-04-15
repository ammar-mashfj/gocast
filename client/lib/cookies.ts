/**
 * Client-side cookie helpers.
 * In production (HTTPS), cookies are set with Secure flag to prevent
 * transmission over unencrypted connections.
 */

const isProduction = typeof window !== "undefined" && window.location.protocol === "https:"

export function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000
  ).toUTCString()
  const secure = isProduction ? "; Secure" : ""
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`)
  )
  return match ? decodeURIComponent(match[1]) : null
}

export function removeCookie(name: string) {
  const secure = isProduction ? "; Secure" : ""
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secure}`
}
