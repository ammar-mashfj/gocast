"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import { clearAuth } from "@/actions/auth"
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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    setDeleting(true)
    try {
      await api.delete("/account", { data: { confirmation: email } })
      clearAuth()
      toast.success("Account deleted — sorry to see you go.")
      router.push("/")
    } catch (err) {
      toast.error(
        (err instanceof AxiosError && (err.response?.data?.errors?.confirmation?.[0] ?? err.response?.data?.message)) ||
          "Couldn’t delete your account. Nothing was removed.",
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
