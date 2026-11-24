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

/**
 * The one way out of a signed-in page once its token is gone (sign-out,
 * "Use a different account", account deletion): raise the flag so nothing
 * else navigates, then a full-page load. The flag stays up until the page
 * unloads.
 */
export function leaveSignedOut(href: string): void {
  setSigningOut(true)
  window.location.assign(href)
}
