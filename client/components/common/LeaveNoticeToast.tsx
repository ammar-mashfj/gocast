"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { LEAVE_NOTICES, LEAVE_PARAM, type LeaveNotice } from "@/lib/signOutState"

/**
 * Shows the notice a sign-out or account deletion left in the URL
 * (`?left=signed-out`, see leaveSignedOut), then takes it out of the address
 * bar so a refresh, a bookmark or a shared link doesn't say it again.
 *
 * Mounts once in the root layout; renders nothing. The param goes with the
 * native replaceState, which Next folds into its router without a
 * navigation, so it can't collide with one.
 */
export function LeaveNoticeToast() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const notice = url.searchParams.get(LEAVE_PARAM)
    if (notice === null) return
    url.searchParams.delete(LEAVE_PARAM)
    window.history.replaceState(null, "", url.pathname + url.search + url.hash)
    if (Object.hasOwn(LEAVE_NOTICES, notice)) toast.success(LEAVE_NOTICES[notice as LeaveNotice])
  }, [])

  return null
}
