"use client"

import { useEmailVerification } from "@/hooks/useEmailVerification"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { Input } from "@/components/ds/Field"

/**
 * Verify the new address after an email change on the Account page. The flow
 * is useEmailVerification's, shared with the login/register dialog; this one
 * is drawn with the ds kit. It only closes through its own buttons (or a
 * verified code): an accidental Esc would leave the account signed in but
 * unverified, with gated actions failing.
 */
export function VerifyEmailDialog({ open, email, onCancel }: { open: boolean; email: string; onCancel: () => void }) {
  const { code, onCodeChange, error, submitting, resending, inputRef, submit, resend, dismiss } = useEmailVerification({ open, onCancel })

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            Enter the 6-digit code sent to <span className="font-semibold text-foreground">{email}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="verify-code" className="text-body-sm font-semibold text-muted-foreground">
              Verification code
            </label>
            <Input
              ref={inputRef}
              id="verify-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={onCodeChange}
              className="h-13 text-center font-mono text-meter-sm tabular-nums code-spaced"
              aria-invalid={!!error}
              aria-describedby={error ? "verify-code-error" : undefined}
            />
            {error && (
              <p id="verify-code-error" role="alert" className="text-body-sm text-fault-text">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="sm:flex-col sm:*:flex-none">
            <Button size="lg" type="submit" disabled={submitting}>
              {submitting ? "Verifying…" : "Verify email"}
            </Button>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="quiet" onClick={resend} disabled={resending}>
                {resending ? "Sending a new code…" : "Resend code"}
              </Button>
              <Button type="button" variant="quiet" onClick={dismiss}>
                Use a different account
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
