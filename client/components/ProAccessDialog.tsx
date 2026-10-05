"use client"

import { useId } from "react"
import { useAccessRequest } from "@/hooks/useAccessRequest"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Defaults describe the Pro request. The Custom card on the pricing page
 * reuses this exact form — same questions, same endpoint — and only swaps the
 * wording, so callers override rather than fork.
 */
const PRO_COPY = {
  title: "Request Pro access",
  description:
    "Pro is in beta and free while it is — no card, nothing to pay. We're onboarding a few stations at a time. Tell us about yours.",
  confirmation:
    "Thanks — your request is in. We're inviting stations in small batches, so it may be a while before you hear from us. There's nothing to pay while Pro is in beta, and we'll give you notice long before billing opens.",
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
 * The access request form, on the marketing kit: the Custom card on the
 * public pricing section (anonymous, POSTs /waitlist and collects an email)
 * and the homepage's Pro waitlist. The dashboard draws the same form with
 * the ds kit (components/dashboard/ProRequestDialog).
 *
 * The form's rules live in useAccessRequest, which both share, so the two
 * can't drift.
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
  const { authed, email, setEmail, social, setSocial, message, setMessage, submitting, error, submitted, submit: handleSubmit, reset } =
    useAccessRequest({ plan, onSubmitted })

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {submitted ? (
          <>
            <p role="status" className="text-sm leading-relaxed text-muted-foreground">
              {confirmation}
            </p>
            <DialogFooter showCloseButton />
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {authed ? (
              // Plain text rather than a disabled field: nothing here can be
              // edited (see accountEmail), and a greyed-out input invites a
              // click that does nothing.
              <p className="text-sm text-muted-foreground">
                Requesting as{" "}
                <span className="font-medium text-foreground break-all">
                  {accountEmail ?? "your account"}
                </span>
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${fieldId}-email`}>Email address</Label>
                <Input
                  id={`${fieldId}-email`}
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-social`}>Link to your public page</Label>
              <Input
                id={`${fieldId}-social`}
                type="text"
                required
                autoFocus={authed}
                inputMode="url"
                placeholder="instagram.com/yourshow"
                value={social}
                onChange={(e) => setSocial(e.target.value)}
                disabled={submitting}
                maxLength={255}
                aria-describedby={`${fieldId}-social-hint`}
              />
              <p id={`${fieldId}-social-hint`} className="text-xs leading-relaxed text-text-faint">
                Instagram, Facebook, TikTok, YouTube — anywhere we can see your
                audience. Paste the full link, not just a handle.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={`${fieldId}-message`}>Tell us about your station</Label>
                <span className="text-xs text-text-faint">Optional</span>
              </div>
              <Textarea
                id={`${fieldId}-message`}
                rows={4}
                className="min-h-24"
                aria-describedby={`${fieldId}-message-hint`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={submitting}
                maxLength={2000}
              />
              <p id={`${fieldId}-message-hint`} className="text-xs leading-relaxed text-text-faint">
                What you broadcast, how often, and what you need from Pro.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-xs text-fault-text">
                {error}
              </p>
            )}
            {/* The form's one filled button. It used to carry a violet glow
                shadow of its own; surfaces here are solid and unlit. */}
            <DialogFooter>
              <Button type="submit" disabled={submitting} className="h-11 w-full">
                {submitting ? "Sending…" : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
