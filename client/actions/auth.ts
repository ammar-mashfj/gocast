import { User } from "@/interfaces/User"
import { setCookie, getCookie, removeCookie } from "@/lib/cookies"

export function saveAuth(_token: string | null | undefined, user: User) {
  // `plan` is stripped on the way in, not merely ignored on the way out.
  // This cookie is written at login and never refreshed, so a plan stored
  // here would keep claiming "Free" for the rest of the session after an
  // upgrade — and a stale field that nobody is supposed to read is a trap
  // waiting for the next person to reach for `getUser().plan`. Entitlements
  // come from AccountContext, which the dashboard layout fills from a live
  // `GET /user`.
  const identity = { ...user }
  delete identity.plan
  setCookie("user", JSON.stringify(identity))
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
