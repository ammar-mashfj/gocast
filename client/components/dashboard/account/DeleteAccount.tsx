"use client"

import { useState } from "react"
import { AxiosError } from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import { useSignOut } from "@/hooks/useSignOut"
import { Button } from "@/components/ds/Button"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"

/**
 * Delete the account: a quiet row that opens the red, typed confirmation.
 * The email is what's typed, not a password, because Google accounts have no
 * password to type; the server checks the same value. "Ends your access",
 * not "erases": deletion is a soft delete, and the dialog mustn't promise
 * more than the API does.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { signOut, isBroadcasting } = useSignOut()

  async function remove() {
    setDeleting(true)
    // Read now: useSignOut ends the show before the DELETE, so a failure
    // after that has to say so.
    const wasOnAir = isBroadcasting
    try {
      // The sign-out path with the DELETE as its revoke: the flag goes up
      // before the token does, so this page's requests 401 without an
      // "expired" redirect racing the page load, and a show on air ends
      // properly first (this dialog's consequences said so).
      const leaving = await signOut("/", {
        confirmed: true,
        notice: "account-deleted",
        revoke: () => api.delete("/account", { data: { confirmation: email } }),
      })
      // Another sign-out already running: that one is leaving, not this.
      if (!leaving) setDeleting(false)
    } catch (err) {
      const reason = (err instanceof AxiosError && (err.response?.data?.errors?.confirmation?.[0] ?? err.response?.data?.message)) || null
      toast.error(
        reason ?? "Couldn’t delete your account.",
        { description: wasOnAir ? "Your show was ended, but nothing else was removed." : "Nothing was removed." },
      )
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold">Delete your account</span>
        <span className="text-body-sm text-muted-foreground">Removes your stations, music and show history for good.</span>
      </div>
      {/* Neutral: this only opens the confirm, whose button is the red one. */}
      <Button variant="ghost" className="shrink-0" onClick={() => setOpen(true)}>
        Delete account…
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={remove}
        busy={deleting}
        tone="danger"
        title="Delete your account?"
        description="This is permanent and can’t be undone."
        consequences={[
          ...(isBroadcasting ? ["Ends the show you’re broadcasting now"] : []),
          "Takes every station you own off air, for good",
          "Breaks every link and embed you’ve shared",
          "Ends your access to your show history and listener stats",
        ]}
        confirmText={email}
        confirmLabel={deleting ? "Deleting…" : "Delete forever"}
        keepLabel="Keep my account"
      />
    </div>
  )
}
