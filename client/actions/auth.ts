import { User } from "@/interfaces/User"
import { setCookie, getCookie, removeCookie } from "@/lib/cookies"

export function saveAuth(_token: string | null | undefined, user: User) {
  setCookie("user", JSON.stringify(user))
}

export function getToken(): string | null {
  return getCookie("token")
}

export function getUser(): User | null {
  const raw = getCookie("user")
  return raw ? JSON.parse(raw) : null
}

export function clearAuth() {
  // Removes legacy non-HttpOnly token cookies from older sessions. Current
  // sessions clear the HttpOnly token via POST /logout.
  removeCookie("token")
  removeCookie("user")
}
