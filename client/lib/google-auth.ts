import { env } from "./env"

type GoogleOAuthPayload =
  | { type: "gocast-oauth"; authenticated: true }
  | { type: "gocast-oauth"; error: string }

export type GoogleOAuthResult =
  | { authenticated: true }
  | { error: string }
  | { dismissed: true }

const POPUP_WIDTH = 500
const POPUP_HEIGHT = 600

/**
 * Open a Google sign-in popup and resolve once the backend has set the
 * HttpOnly auth cookie and postMessages the result back.
 *
 * Security model:
 *   - postMessage sender origin is pinned to the API origin — we reject any
 *     other origin even if the payload shape looks right.
 *   - Payload `type` is checked to avoid picking up unrelated messages from
 *     browser extensions or other scripts running on the page.
 *   - The backend's postMessage target origin is pinned to FRONTEND_URL
   *     (server config), so a mis-served callback can't report success to an
   *     unrelated origin.
 *
 * Resolves with `{dismissed: true}` if the user closes the popup without
 * completing sign-in, so callers can reset loading state cleanly.
 */
export function signInWithGoogle(): Promise<GoogleOAuthResult> {
  return new Promise((resolve) => {
    const apiOrigin = new URL(env.apiUrl).origin

    const width = POPUP_WIDTH
    const height = POPUP_HEIGHT
    const left = window.screenX + Math.max(0, (window.innerWidth - width) / 2)
    const top = window.screenY + Math.max(0, (window.innerHeight - height) / 2)

    const opened = window.open(
      `${env.apiUrl}/auth/google`,
      "gocast-google-oauth",
      `width=${width},height=${height},left=${left},top=${top},noopener=no,noreferrer=no`,
    )

    if (!opened) {
      resolve({ error: "popup_blocked" })
      return
    }

    // Narrow `opened` for use inside closures below — TypeScript can't see
    // through the early-return above once we close over `popup`.
    const popup: Window = opened

    let settled = false
    const settle = (result: GoogleOAuthResult) => {
      if (settled) return
      settled = true
      window.removeEventListener("message", onMessage)
      clearInterval(closedPoll)
      resolve(result)
    }

    function onMessage(event: MessageEvent) {
      // Browser sets event.origin to the sending window's actual origin —
      // it cannot be spoofed. Reject anything that isn't our API.
      if (event.origin !== apiOrigin) return

      const data = event.data as GoogleOAuthPayload | undefined
      if (!data || data.type !== "gocast-oauth") return

      if ("authenticated" in data) {
        settle({ authenticated: true })
      } else {
        settle({ error: data.error || "google_auth_failed" })
      }

      // The popup closes itself after posting, but close defensively in case
      // the opener-close path was blocked (rare, e.g. when popup is in a
      // different browsing-context group).
      try { popup.close() } catch {}
    }

    // Detect a user-dismissed popup — polling is the only cross-browser way
    // since there's no 'close' event on a different-origin Window. Poll at
    // 500ms; the UX cost of the message-vs-closed race is minimal.
    const closedPoll = window.setInterval(() => {
      if (popup.closed) settle({ dismissed: true })
    }, 500)

    window.addEventListener("message", onMessage)
  })
}
