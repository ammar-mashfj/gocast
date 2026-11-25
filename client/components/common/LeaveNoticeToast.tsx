"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { LEAVE_NOTICES, LEAVE_PARAM, type LeaveNotice } from "@/lib/signOutState"

/**
 * Shows the notice a sign-out or account deletion left in the URL
 * (`?left=signed-out`, see leaveSignedOut), then takes it out of the address
 * bar so a refresh, a bookmark or a shared link doesn't say it again.
 *
 * Mounts once in the root layout; renders nothing. The param goes with
 * replaceState, not router.replace: no navigation on page load to collide
 * with another one.
 *
 * On the next tick, not in the effect itself: Next patches replaceState in
 * the root router's own effect, and React runs this child's effect first.
 * The raw replaceState would wipe the history entry Next saved for the page
 * (Back to it then changes the address bar and not the screen) and leave
 * `?left=` in Next's copy of the URL, which can write it back. The patched
 * one keeps Next's entry and updates its URL.
 */
export function LeaveNoticeToast() {
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href)
      const notice = url.searchParams.get(LEAVE_PARAM)
      if (notice === null) return
      url.searchParams.delete(LEAVE_PARAM)
      window.history.replaceState(null, "", url.pathname + url.search + url.hash)
      if (Object.hasOwn(LEAVE_NOTICES, notice)) toast.success(LEAVE_NOTICES[notice as LeaveNotice])
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return null
}
