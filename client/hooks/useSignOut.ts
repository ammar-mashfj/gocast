"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useBroadcastOptional } from "@/contexts/BroadcastContext"
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
  const isBroadcasting = state === "live" || state === "reconnecting" || state === "connecting"

  const [signingOut, setLocal] = useState(isSigningOutGlobal)
  useEffect(() => {
    subscribers.add(setLocal)
    return () => { subscribers.delete(setLocal) }
  }, [])

  const signOut = useCallback(async (redirectTo: string = "/") => {
    if (isSigningOutGlobal) return
    if (isBroadcasting) {
      const confirmed = window.confirm(
        "You're broadcasting right now. Sign out will end your broadcast. Continue?",
      )
      if (!confirmed) return
    }
    setSigningOut(true)
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
  }, [isBroadcasting, router])

  return { signOut, signingOut }
}
