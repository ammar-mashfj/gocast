/**
 * In-app navigation for code that runs outside React.
 *
 * The axios interceptor has no router. It used to set `window.location`,
 * which reloads the whole app and, in analytics, opens a fresh session that
 * lists gocast.fm as its own referrer. `RouterBridge` hands the App Router's
 * `replace` in here once mounted; until then, or on a page without it, the
 * hard navigation is still the fallback.
 */
type Navigate = (href: string) => void

let navigator: Navigate | null = null

export function registerNavigator(fn: Navigate | null): void {
  navigator = fn
}

export function navigate(href: string): void {
  if (navigator) {
    navigator(href)
    return
  }
  if (typeof window !== "undefined") window.location.href = href
}
