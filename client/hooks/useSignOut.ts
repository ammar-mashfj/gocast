"use client"

import { useCallback, useEffect, useState } from "react"
import { useBroadcastOptional } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import api from "@/lib/axios"
import { clearAuth } from "@/actions/auth"
import { isSigningOut, leaveSignedOut, setSigningOut, subscribeSigningOut } from "@/lib/signOutState"

/**
 * Single sign-out path used by every "sign out" affordance.
 *
 * Centralizes:
 *  - the broadcast guard (don't silently kill an active broadcast)
 *  - the API call (best-effort — we always clear local auth even if the
 *    server can't be reached)
 *  - the redirect, and the "Signed out" notice the next page shows
 *  - the shared pending-state flag (lib/signOutState) so all sign-out
 *    buttons disable, and so the studio and the axios 401 redirect stand
 *    back instead of navigating at the same time
 */
export function useSignOut() {
  // Optional — UserMenu renders on the marketing nav, outside the provider.
  const broadcast = useBroadcastOptional()
  const state = broadcast?.state
  const liveSince = broadcast?.liveSince ?? null
  const isBroadcasting = state === "live" || state === "reconnecting" || state === "connecting"
  const stopBroadcast = broadcast?.stop
  const hasBroadcast = !!state && state !== "idle"
  // As End show does: a station without AutoDJ has nothing to fall back to.
  const autoDjLocked = useAutoDjLocked()

  const [signingOut, setLocal] = useState(isSigningOut)
  useEffect(() => subscribeSigningOut(setLocal), [])
  // Back from the homepage can restore this page from the back/forward cache
  // with the flag still up from the sign-out that left it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setSigningOut(false) }
    window.addEventListener("pageshow", onShow)
    return () => window.removeEventListener("pageshow", onShow)
  }, [])

  /**
   * `confirmed` is for callers that asked with their own dialog first; the
   * native confirm below is only the fallback for ones that didn't.
   */
  const signOut = useCallback(async (redirectTo: string = "/", options?: { confirmed?: boolean }) => {
    if (isSigningOut()) return
    if (isBroadcasting && !options?.confirmed) {
      const confirmed = window.confirm(
        "You're broadcasting right now. Sign out will end your broadcast. Continue?",
      )
      if (!confirmed) return
    }
    // Up before the show stops: the studio's end-of-show redirect to the wrap
    // screen reads it and stays put.
    setSigningOut(true)
    // End the show while the token still works. Leaving it to the redirect
    // kept the socket, the mic and the engine alive on the homepage with no
    // way to stop them, and the revoked token only ended it at the next drop.
    if (hasBroadcast && stopBroadcast) {
      try {
        // On air, as End show; still in the checks, as Cancel: only a station
        // this run turned on is handed back. A lost show (an `error` that
        // aired) ends as ShowLost's End show does.
        const onAir = state === "live" || state === "reconnecting" || (state === "error" && liveSince !== null)
        await stopBroadcast({ releaseStation: !autoDjLocked ? false : onAir ? true : "if-started-here" })
      } catch {
        // Signing out goes ahead; the provider's unmount stops what's left.
      }
    }
    try {
      await api.post("/logout")
    } catch {
      // Best-effort — token will be invalid server-side eventually anyway.
    }
    clearAuth()
    // One full-page load, never push + refresh: overlapping App Router
    // navigations crash it, and the reload also drops the broadcast and
    // account contexts and the router cache of the signed-in pages. The flag
    // stays up until the page unloads, so nothing else navigates meanwhile.
    leaveSignedOut(redirectTo, "signed-out")
  }, [isBroadcasting, hasBroadcast, stopBroadcast, state, liveSince, autoDjLocked])

  return { signOut, signingOut, isBroadcasting }
}
