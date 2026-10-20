"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import api from "@/lib/axios"

/**
 * The access-request form's state and submit, shared by the two dialogs that
 * draw it: ProAccessDialog (marketing kit — the pricing page's Custom card
 * and the homepage) and the dashboard's ProRequestDialog (ds kit). One copy
 * of the rules, because they must not drift: `social` is REQUIRED server-side
 * on both paths, so a looser form would be rejected on submit.
 *
 * Pro goes to the authenticated endpoint, which reads the email and the plan
 * off the session (neither is sent, so nobody believes they're honoured).
 * Anything else is the public enquiry and collects an email.
 */
export function useAccessRequest({ plan, onSubmitted }: { plan: string; onSubmitted?: () => void }) {
  const authed = plan === "pro"
  const [email, setEmail] = useState("")
  const [social, setSocial] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!authed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.")
      return
    }
    // A bare "@handle" can't be looked up without knowing the platform, so
    // nudge toward something with a domain in it.
    if (!social.includes(".")) {
      setError("Please paste a full link to a public page so we can find you.")
      return
    }

    setSubmitting(true)
    try {
      await api.post(
        authed ? "/waitlist/pro" : "/waitlist",
        authed ? { social: social.trim(), message: message.trim() } : { email, plan, social: social.trim(), message: message.trim() },
      )
      setSubmitted(true)
      onSubmitted?.()
      toast.success("Request received — thanks.")
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err && "response" in err ? (err as { response?: { status?: number } }).response?.status : undefined
      setError(
        status === 401
          ? "Your session has expired. Please sign in again."
          : status === 429
            ? "Too many attempts. Please try again later."
            : status === 422
              ? "Please check the details and try again."
              : "Something went wrong. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  /** Back to an empty form, for when the dialog closes. */
  function reset() {
    setEmail("")
    setSocial("")
    setMessage("")
    setError(null)
    setSubmitted(false)
  }

  return { authed, email, setEmail, social, setSocial, message, setMessage, submitting, error, submitted, submit, reset }
}
