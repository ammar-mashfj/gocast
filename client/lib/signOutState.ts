import { getCookie } from "@/lib/cookies"

/**
 * Whether a sign-out is running, readable from outside React.
 *
 * Signing out on air used to fire navigations from four places at once: the
 * studio's end-of-show redirect, the wrap screen's bounce, the axios 401
 * redirect for requests the logout had just revoked, and the sign-out's own
 * push + refresh. Overlapping App Router navigations crash it ("Rendered more
 * hooks than during the previous render"). While this flag is up, sign-out is
 * the only thing that navigates, and it does one full-page load.
 */
let signingOut = false
const subscribers = new Set<(value: boolean) => void>()

export function isSigningOut(): boolean {
  return signingOut
}

export function setSigningOut(value: boolean): void {
  signingOut = value
  for (const s of subscribers) s(value)
}

export function subscribeSigningOut(fn: (value: boolean) => void): () => void {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

const hasUserCookie = () => typeof document !== "undefined" && getCookie("user") !== null

/**
 * Back can restore a page from the back/forward cache exactly as it was left.
 * Two things to undo:
 *  - a page that was signed in, now signed out (a sign-out here, or one in
 *    another tab): it would show the last user's email, stations and plan
 *    without a request, to whoever has the computer next. Reload it; the
 *    server sends a signed-out visitor to sign-in. "Was signed in" is any of:
 *    signed in when it loaded, signed out from here (most people sign in on
 *    the login page and reach the dashboard without a reload), or a
 *    dashboard URL.
 *  - the flag, still up from the sign-out that left this page. Module level,
 *    not in a component: whichever exit raised it, the page may have no
 *    sign-out button mounted to drop it.
 */
const signedInAtLoad = hasUserCookie()
let signedOutHere = false
const SIGNED_IN_PATHS = ["/dashboard"]

/** What a pageshow calls for; exported for tests. */
export function onPageShow(persisted: boolean): "reload" | "reset" | null {
  if (!persisted) return null
  const wasSignedIn = signedInAtLoad || signedOutHere || SIGNED_IN_PATHS.some((p) => window.location.pathname.startsWith(p))
  if (wasSignedIn && !hasUserCookie()) return "reload"
  setSigningOut(false)
  return "reset"
}

if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (e) => {
    if (onPageShow(e.persisted) === "reload") window.location.reload()
  })
}

/**
 * What the next page tells the visitor after the full-page load. A key, not
 * the text: a crafted link can only show one of these messages.
 */
export const LEAVE_NOTICES = {
  "signed-out": "Signed out",
  "account-deleted": "Account deleted — sorry to see you go.",
} as const
export type LeaveNotice = keyof typeof LEAVE_NOTICES

/** Query param that carries the notice across the reload (components/common/LeaveNoticeToast). */
export const LEAVE_PARAM = "left"

/**
 * The one way out of a signed-in page once its token is gone (sign-out,
 * "Use a different account", account deletion): raise the flag so nothing
 * else navigates, then a full-page load. The flag stays up until the page
 * unloads, with no timeout: auth is already cleared, so a page that somehow
 * stays has nothing left to protect, while a timeout would let a late 401
 * navigate on top of a load that is merely slow. A toast fired here would
 * die with the page, so the notice rides along in the URL and the next page
 * shows it.
 *
 * replace, not assign: the page signing out leaves history. Earlier entries
 * from the same visit (other dashboard pages) stay; Back to them loads them
 * fresh, which the server sends to sign-in, or restores them from the
 * back/forward cache, which onPageShow reloads.
 */
export function leaveSignedOut(href: string, notice: LeaveNotice): void {
  setSigningOut(true)
  signedOutHere = true
  const url = new URL(href, window.location.origin)
  url.searchParams.set(LEAVE_PARAM, notice)
  window.location.replace(url.pathname + url.search + url.hash)
}

/**
 * The session was already gone when an exit that needs it ran (Delete account
 * with an expired token): its 401 stayed out of the expiry redirect because
 * the flag was up, so send the visitor to sign-in here, the way that redirect
 * would have.
 */
export function leaveExpired(): void {
  setSigningOut(true)
  signedOutHere = true
  window.location.replace("/auth/login?expired=1")
}
