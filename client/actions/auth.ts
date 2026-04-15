import { User } from "@/interfaces/User"
import { setCookie, getCookie, removeCookie } from "@/lib/cookies"

export function saveAuth(token: string, user: User) {
  setCookie("token", token)
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
  removeCookie("token")
  removeCookie("user")
}
