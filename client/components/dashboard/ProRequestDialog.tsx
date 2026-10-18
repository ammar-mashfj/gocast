"use client"

import { useAccessRequest } from "@/hooks/useAccessRequest"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextAreaField, TextField } from "@/components/ds/Field"

/**
 * Get Pro, from inside the dashboard (every "Get Pro" button opens it
 * through ProRequestContext). The same form as the marketing kit's
 * ProAccessDialog — the rules are useAccessRequest's — drawn with the ds kit.
 *
 * Always the authenticated path: the server takes the email from the
 * session, so it's shown as text, not a field that would silently do nothing.
 */
export function ProRequestDialog({
  open,
  onOpenChange,
  accountEmail,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountEmail?: string
  onSubmitted?: () => void
}) {
  const form = useAccessRequest({ plan: "pro", onSubmitted })
  // Every way out (Escape, X, overlay, the Close button) goes through here so
  // the next open starts on the form, not on the last request's "Thanks".
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Pro</DialogTitle>
          <DialogDescription>
            Tell us about your station and we’ll email you how to pay. Pro switches on as soon as your payment arrives.
          </DialogDescription>
        </DialogHeader>

        {form.submitted ? (
          <>
            <p role="status" className="text-body-sm text-muted-foreground">
              Thanks — we’ve got it. We’ll be in touch by email with how to pay.
            </p>
            <DialogFooter>
              <Button size="lg" variant="subtle" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={form.submit} className="flex flex-col gap-3.5">
            <p className="text-body-sm text-muted-foreground">
              Requesting as <span className="font-semibold break-all text-foreground">{accountEmail ?? "your account"}</span>
            </p>
            <TextField
              label="Link to your public page"
              value={form.social}
              onChange={(e) => form.setSocial(e.target.value)}
              placeholder="instagram.com/yourshow"
              inputMode="url"
              required
              autoFocus
              maxLength={255}
              disabled={form.submitting}
              hint="Instagram, Facebook, TikTok, YouTube — anywhere we can see your audience. The full link, not just a handle."
            />
            <TextAreaField
              label="Tell us about your station (optional)"
              value={form.message}
              onChange={(e) => form.setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              disabled={form.submitting}
              hint="What you broadcast, how often, and what you need from Pro."
            />
            {form.error && (
              <p role="alert" className="text-body-sm text-fault-text">
                {form.error}
              </p>
            )}
            <DialogFooter>
              <Button size="lg" variant="pro" type="submit" disabled={form.submitting}>
                {form.submitting ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
