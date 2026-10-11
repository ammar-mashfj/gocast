"use client"

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import { clearAuth, saveAuth } from "@/actions/auth"
import type { User } from "@/interfaces/User"

type VerifyResponse = { data?: User; message?: string }

/**
 * The "enter the 6-digit code" flow, shared by the two dialogs that draw it:
 * components/auth/VerifyEmailDialog (marketing kit — login and register) and
 * components/dashboard/account/VerifyEmailDialog (ds kit — after an email
 * change on the Account page).
 *
 * On open it refreshes `/user`, so a verification the cookie hasn't heard of
 * (admin flag, another tab) goes straight to the dashboard. The sixth digit
 * submits; a code typed while a check is in flight is queued, not dropped.
 * "Use a different account" signs out, then calls `onCancel`.
 */
export function useEmailVerification({ open, onCancel }: { open: boolean; onCancel: () => void }) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlightRef = useRef(false)
  const queuedCodeRef = useRef<string | null>(null)
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
        router.replace("/dashboard")
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
    router.replace("/dashboard")

    return true
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length !== 6) {
      setError("Enter the 6-digit code.")
      return
    }
    void verify(code)
  }

  async function verify(value: string) {
    // A code typed while a check is in flight (a corrected sixth digit) is
    // queued, not dropped, and the in-flight check's error is discarded so it
    // never lands under the corrected code.
    if (inFlightRef.current) {
      queuedCodeRef.current = value
      return
    }
    inFlightRef.current = true
    setError(null)
    setSubmitting(true)
    try {
      const response = await api.post<VerifyResponse>("/email/verify", { code: value })
      queuedCodeRef.current = null
      handleVerifiedResponse(response.data)
    } catch (err) {
      if (queuedCodeRef.current && queuedCodeRef.current !== value) {
        // Superseded: the finally block sends the newer code.
      } else if (err instanceof AxiosError) {
        const fieldError = err.response?.data?.errors?.code?.[0]
        setError(fieldError || err.response?.data?.message || "Couldn't verify that code.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      inFlightRef.current = false
      setSubmitting(false)
      const queued = queuedCodeRef.current
      queuedCodeRef.current = null
      if (queued && queued !== value) void verify(queued)
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

  function onCodeChange(e: ChangeEvent<HTMLInputElement>) {
    // Strip non-digits: pasted codes often carry spaces or hyphens, which the
    // server rejects with `digits:6`.
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
    setCode(digits)
    if (error) setError(null)
    // The sixth digit submits. Clarity showed "Verify email" clicked three and
    // four times a session; typing or pasting the whole code is the moment
    // the person is done.
    if (digits.length === 6 && digits !== code) void verify(digits)
  }

  return { code, onCodeChange, error, submitting, resending, inputRef, submit: handleSubmit, resend, dismiss }
}
