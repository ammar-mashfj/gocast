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

// Back from the next page can restore this one from the back/forward cache
// with the flag still up from the sign-out that left it. Module level, not in
// a component: whichever exit raised the flag, the page it left may have no
// sign-out button mounted to drop it.
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (e) => { if (e.persisted) setSigningOut(false) })
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
 * unloads. A toast fired here would die with the page, so the notice rides
 * along in the URL and the next page shows it.
 */
export function leaveSignedOut(href: string, notice: LeaveNotice): void {
  setSigningOut(true)
  const url = new URL(href, window.location.origin)
  url.searchParams.set(LEAVE_PARAM, notice)
  window.location.assign(url.pathname + url.search + url.hash)
}
