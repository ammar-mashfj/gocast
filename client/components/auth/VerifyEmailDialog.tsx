"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/axios"
import { clearAuth, saveAuth } from "@/actions/auth"
import { User } from "@/interfaces/User"

type VerifyResponse = { data?: User; message?: string }

interface VerifyEmailDialogProps {
  open: boolean
  email: string
  /**
   * Called when the user dismisses the dialog. The parent decides what that
   * means — typically: clear auth and stay on the login/register page.
   */
  onCancel: () => void
}

/**
 * In-flow email verification modal shown on login/register when the user is
 * unverified. Owns the "enter 6-digit code" form, handles resend, and fires
 * a `/user` refresh on mount to catch server-side verifications that the
 * cookie hasn't learned about yet. Routes the user to the dashboard on
 * success — there is no standalone verify-email route.
 */
export function VerifyEmailDialog({ open, email, onCancel }: VerifyEmailDialogProps) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cookie-vs-server reconciliation: if the user is already verified on the
  // server (admin flag, another tab), bail straight to the dashboard instead
  // of showing a form they can't meaningfully submit.
  useEffect(() => {
    if (!open) return

    api.get<{ data: User }>("/user").then((res) => {
      const fresh = res.data.data
      saveAuth(null, fresh)
      if (fresh.email_verified_at) {
        router.replace("/dashboard/stations")
      }
    }).catch(() => {
      // Transient; stay on the form.
    })
  }, [open, router])

  // Autofocus whenever the dialog opens so the user can start typing
  // immediately without a click.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleVerifiedResponse(data: VerifyResponse): boolean {
    if (!data.data?.email_verified_at) return false

    saveAuth(null, data.data)
    toast.success("Email verified")
    router.replace("/dashboard/stations")

    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length !== 6) {
      setError("Enter the 6-digit code.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const response = await api.post<VerifyResponse>("/email/verify", { code })
      handleVerifiedResponse(response.data)
    } catch (err) {
      if (err instanceof AxiosError) {
        const fieldError = err.response?.data?.errors?.code?.[0]
        setError(fieldError || err.response?.data?.message || "Couldn't verify that code.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function resend() {
    setResending(true)
    try {
      const response = await api.post<VerifyResponse>("/email/resend")
      if (handleVerifiedResponse(response.data)) return
      toast.success("New code sent. Check your inbox.")
      setCode("")
      setError(null)
      inputRef.current?.focus()
    } catch {
      toast.error("Couldn't send a new code. Try again in a minute.")
    } finally {
      setResending(false)
    }
  }

  async function dismiss() {
    try {
      await api.post("/logout")
    } catch {
      // Best-effort; local display state is cleared either way.
    }
    clearAuth()
    onCancel()
  }

  return (
    <Dialog open={open}>
      {/* Only close via explicit controls (Resend / Use a different account /
          successful verify). Outside-click and Esc are suppressed so an accidental
          dismissal can't leave the cookie in an unverified-but-logged-in state. */}
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            Enter the 6-digit code sent to <span className="text-foreground font-medium">{email}</span>.
            Didn&apos;t get one? Resend below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-code">Verification code</Label>
            <Input
              ref={inputRef}
              id="verify-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                // Strip non-digits — pasted codes often include spaces or
                // hyphens, which the server rejects with `digits:6`.
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
                setCode(digits)
                if (error) setError(null)
              }}
              className="tracking-[0.5em] text-center text-lg"
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" disabled={submitting || code.length !== 6} className="w-full">
              {submitting ? "Verifying…" : "Verify email"}
            </Button>
            <div className="flex items-center justify-between w-full pt-1">
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-60"
              >
                {resending ? "Sending new code…" : "Resend code"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Use a different account
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
