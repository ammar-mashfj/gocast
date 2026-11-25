"use client"

import { useCallback, useEffect, useState } from "react"
import { useBroadcastOptional } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import api from "@/lib/axios"
import { clearAuth } from "@/actions/auth"
import { isSigningOut, leaveSignedOut, setSigningOut, subscribeSigningOut, type LeaveNotice } from "@/lib/signOutState"

export type SignOutOptions = {
  confirmed?: boolean
  /** What the next page says (see LEAVE_NOTICES). */
  notice?: LeaveNotice
  revoke?: () => Promise<unknown>
}

/**
 * Single sign-out path used by every way out of a signed-in page: the
 * sign-out buttons, "Use a different account" on the Account page, and
 * account deletion (through `revoke`).
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

  /**
   * `confirmed` is for callers that asked with their own dialog first; the
   * native confirm below is only the fallback for ones that didn't.
   *
   * `revoke` replaces /logout for an exit that ends the token another way
   * (account deletion). Unlike /logout its failure counts: the flag drops,
   * nothing is cleared, and the error is rethrown for the caller to show.
   * A show on air has ended by then; the caller's confirm says so.
   *
   * Resolves true once the page is on its way out, false if nothing started
   * (another sign-out already running, or Cancel on the on-air prompt), so a
   * caller showing a busy state knows to drop it.
   */
  const signOut = useCallback(async (redirectTo: string = "/", options?: SignOutOptions): Promise<boolean> => {
    if (isSigningOut()) return false
    if (isBroadcasting && !options?.confirmed) {
      const confirmed = window.confirm(
        "You're broadcasting right now. Sign out will end your broadcast. Continue?",
      )
      if (!confirmed) return false
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
    if (options?.revoke) {
      try {
        await options.revoke()
      } catch (err) {
        setSigningOut(false)
        throw err
      }
    } else {
      try {
        await api.post("/logout")
      } catch {
        // Best-effort — token will be invalid server-side eventually anyway.
      }
    }
    clearAuth()
    // One full-page load, never push + refresh: overlapping App Router
    // navigations crash it, and the reload also drops the broadcast and
    // account contexts and the router cache of the signed-in pages. The flag
    // stays up until the page unloads, so nothing else navigates meanwhile.
    leaveSignedOut(redirectTo, options?.notice ?? "signed-out")
    return true
  }, [isBroadcasting, hasBroadcast, stopBroadcast, state, liveSince, autoDjLocked])

  return { signOut, signingOut, isBroadcasting }
}
