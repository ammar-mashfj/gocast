"use client"

import { useId, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import api from "@/lib/axios"

const FIELD_CLASS =
  "bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-violet-border/70"

const LABEL_CLASS = "text-sm font-medium text-text-secondary"

/**
 * Defaults describe the Pro request. The Custom card on the pricing page
 * reuses this exact form — same questions, same endpoint — and only swaps the
 * wording, so callers override rather than fork.
 */
const PRO_COPY = {
  title: "Request Pro access",
  description:
    "Pro is in beta and we're onboarding a few stations at a time. Tell us about yours.",
  confirmation:
    "Thanks — your request is in. We're inviting stations in small batches, so it may be a while before you hear from us.",
  submitLabel: "Request access",
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Which plan the request is for, and — because Pro is the authenticated
   * one — which endpoint this form posts to. See `authed` below.
   */
  plan: string
  /**
   * The signed-in account's email, passed in by the dashboard.
   *
   * Shown, not edited: on the Pro path the server takes the address from the
   * session and ignores anything in the body, so an editable field here would
   * be a control that silently does nothing. Someone who needs to be reached
   * on a different address can say so in the message.
   */
  accountEmail?: string
  /** Fired once the request is accepted, so callers can settle their CTAs. */
  onSubmitted?: () => void
  /** Copy overrides. Default to the Pro wording; see PRO_COPY. */
  title?: string
  description?: string
  confirmation?: string
  submitLabel?: string
}

/**
 * The access request form, used by two surfaces that are no longer the same
 * shape:
 *
 * - Pro, from inside the dashboard. Authenticated; POSTs /waitlist/pro, which
 *   takes the email and the plan off the session.
 * - Custom, from the public pricing section. Anonymous; POSTs /waitlist and
 *   collects an email, because that enquiry comes from people evaluating the
 *   product before they have an account.
 *
 * One component rather than two because the qualifying questions must not
 * drift: `social` is REQUIRED server-side on both paths, so a simpler second
 * form would have been rejected by the API on submit.
 *
 * There is still no checkout behind any of this: Pro has no Stripe
 * integration, and access is granted by hand from these entries.
 */
export function ProAccessDialog({
  open,
  onOpenChange,
  plan,
  accountEmail,
  onSubmitted,
  title = PRO_COPY.title,
  description = PRO_COPY.description,
  confirmation = PRO_COPY.confirmation,
  submitLabel = PRO_COPY.submitLabel,
}: Props) {
  const fieldId = useId()

  // Pro goes to the authenticated endpoint, which derives both the email and
  // the plan from the session. Custom stays public — that enquiry genuinely
  // comes from people who have not signed up — so it still collects an email.
  const authed = plan === "pro"

  const [email, setEmail] = useState("")
  const [social, setSocial] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!authed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.")
      return
    }

    // A bare "@handle" is not lookupable without knowing the platform, so
    // nudge toward something with a domain in it.
    if (!social.includes(".")) {
      setError("Please paste a full link to a public page so we can find you.")
      return
    }

    setSubmitting(true)
    try {
      // Neither `email` nor `plan` is sent on the Pro path: the server reads
      // both off the session, and sending them would only invite the belief
      // that they are honoured.
      await api.post(
        authed ? "/waitlist/pro" : "/waitlist",
        authed
          ? { social: social.trim(), message: message.trim() }
          : { email, plan, social: social.trim(), message: message.trim() },
      )
      setSubmitted(true)
      onSubmitted?.()
      toast.success("Request received — thanks.")
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined
      if (status === 401) {
        setError("Your session has expired. Please sign in again.")
      } else if (status === 429) {
        setError("Too many attempts. Please try again later.")
      } else if (status === 422) {
        setError("Please check the details and try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setEmail("")
      setSocial("")
      setMessage("")
      setError(null)
      setSubmitted(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-6 text-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="py-4 text-sm text-text-muted leading-relaxed">
            {confirmation}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
            {authed ? (
              <div className="flex flex-col gap-1.5">
                <span className={LABEL_CLASS}>Requesting as</span>
                <div className={`${FIELD_CLASS} opacity-70`}>
                  {accountEmail ?? "your account"}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${fieldId}-email`} className={LABEL_CLASS}>
                  Email address
                </label>
                <input
                  id={`${fieldId}-email`}
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD_CLASS}
                  disabled={submitting}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${fieldId}-social`} className={LABEL_CLASS}>
                Link to your public page
              </label>
              <p className="text-xs text-text-faint leading-relaxed">
                Instagram, Facebook, TikTok, YouTube — anywhere we can see your
                audience. Paste the full link, not just a handle.
              </p>
              <input
                id={`${fieldId}-social`}
                type="text"
                required
                autoFocus={authed}
                placeholder="instagram.com/yourshow"
                value={social}
                onChange={(e) => setSocial(e.target.value)}
                className={FIELD_CLASS}
                disabled={submitting}
                maxLength={255}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`${fieldId}-message`} className={LABEL_CLASS}>
                  Tell us about your station
                </label>
                <span className="text-xs text-text-faint">Optional</span>
              </div>
              <p className="text-xs text-text-faint leading-relaxed">
                What you broadcast, how often, and what you need from Pro.
              </p>
              <textarea
                id={`${fieldId}-message`}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${FIELD_CLASS} resize-none`}
                disabled={submitting}
                maxLength={2000}
              />
            </div>

            {error && <div className="text-xs text-red-400">{error}</div>}
            <DialogFooter>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg text-sm font-medium bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : submitLabel}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
