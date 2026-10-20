"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"

/**
 * While the schedule has unsaved changes, a click on any in-app link (the
 * sidebar, the top bar, the status band…) asks first instead of leaving.
 * One capturing listener on the document, so no link needs wiring: it runs
 * before React's own handlers, which is what stops next/link navigating.
 *
 * A reload or a closed tab is the browser's beforeunload prompt (the
 * planner's). The browser's Back button is not guarded: Next has no clean
 * way to cancel it.
 */
export function LeaveGuard({
  dirty,
  blockedReason,
  onSave,
}: {
  dirty: boolean
  /** Why Save can't run right now (overlap, no timezone), or null. */
  blockedReason: string | null
  /** Saves; true when it went through. */
  onSave: () => Promise<boolean>
}) {
  const router = useRouter()
  const [href, setHref] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      // New tab / window / download: nothing here is lost.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page (a hash link): not leaving.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setHref(url.pathname + url.search + url.hash)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [dirty])

  async function saveAndLeave() {
    if (!href) return
    setSaving(true)
    const ok = await onSave()
    setSaving(false)
    if (ok) router.push(href)
    // On failure the dialog stays; the page shows why it wasn't saved.
  }

  return (
    <Dialog open={href !== null} onOpenChange={(open) => !open && !saving && setHref(null)}>
      <DialogContent size="sm" showCloseButton={false}>
        {/* No close button here, so no room kept for one. */}
        <DialogHeader className="pr-0">
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>
            {blockedReason ?? "Your schedule has changes that aren’t saved yet."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-col sm:*:flex-none">
          {!blockedReason && (
            <Button size="lg" onClick={saveAndLeave} disabled={saving}>
              {saving && <IconLoader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save and leave"}
            </Button>
          )}
          <Button
            size="lg"
            variant="quiet"
            className="text-error hover:text-error"
            disabled={saving}
            onClick={() => {
              const to = href
              setHref(null)
              if (to) router.push(to)
            }}
          >
            Leave without saving
          </Button>
          <Button size="lg" variant="subtle" disabled={saving} onClick={() => setHref(null)}>
            Stay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
