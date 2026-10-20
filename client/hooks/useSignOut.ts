"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useBroadcastOptional } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import api from "@/lib/axios"
import { clearAuth } from "@/actions/auth"

/**
 * Module-level flag + subscriber set so every `useSignOut()` consumer (sidebar
 * dropdown + homepage user menu, etc.) sees the same pending state. Without
 * this, only the button you clicked shows a spinner — the other affordances
 * stay idle even though the sign-out is in flight.
 */
let isSigningOutGlobal = false
const subscribers = new Set<(value: boolean) => void>()

function setSigningOut(value: boolean) {
  isSigningOutGlobal = value
  for (const s of subscribers) s(value)
}

/**
 * Single sign-out path used by every "sign out" affordance.
 *
 * Centralizes:
 *  - the broadcast guard (don't silently kill an active broadcast)
 *  - the API call (best-effort — we always clear local auth even if the
 *    server can't be reached)
 *  - the toast + redirect
 *  - the shared pending-state flag so all sign-out buttons can disable
 */
export function useSignOut() {
  const router = useRouter()
  // Optional — UserMenu renders on the marketing nav, outside the provider.
  const broadcast = useBroadcastOptional()
  const state = broadcast?.state
  const liveSince = broadcast?.liveSince ?? null
  const isBroadcasting = state === "live" || state === "reconnecting" || state === "connecting"
  const stopBroadcast = broadcast?.stop
  const hasBroadcast = !!state && state !== "idle"
  // As End show does: a station without AutoDJ has nothing to fall back to.
  const autoDjLocked = useAutoDjLocked()

  const [signingOut, setLocal] = useState(isSigningOutGlobal)
  useEffect(() => {
    subscribers.add(setLocal)
    return () => { subscribers.delete(setLocal) }
  }, [])

  /**
   * `confirmed` is for callers that asked with their own dialog first; the
   * native confirm below is only the fallback for ones that didn't.
   */
  const signOut = useCallback(async (redirectTo: string = "/", options?: { confirmed?: boolean }) => {
    if (isSigningOutGlobal) return
    if (isBroadcasting && !options?.confirmed) {
      const confirmed = window.confirm(
        "You're broadcasting right now. Sign out will end your broadcast. Continue?",
      )
      if (!confirmed) return
    }
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
    toast.success("Signed out")
    router.push(redirectTo)
    router.refresh()
    // Reset the shared flag so a returning user (signs out → signs back in →
    // tries to sign out again in the same SPA session) doesn't see a
    // permanently-disabled button. The brief flash before the redirect
    // unmounts the button is invisible in practice.
    setSigningOut(false)
  }, [isBroadcasting, hasBroadcast, stopBroadcast, state, liveSince, autoDjLocked, router])

  return { signOut, signingOut, isBroadcasting }
}
