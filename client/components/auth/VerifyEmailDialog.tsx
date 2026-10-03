"use client"

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
import { useEmailVerification } from "@/hooks/useEmailVerification"

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
 * unverified. The flow is useEmailVerification's (shared with the dashboard's
 * ds-kit dialog); this draws it with the marketing kit. Routes the user to
 * the dashboard on success — there is no standalone verify-email route.
 */
export function VerifyEmailDialog({ open, email, onCancel }: VerifyEmailDialogProps) {
  const { code, onCodeChange, error, submitting, resending, inputRef, submit: handleSubmit, resend, dismiss } = useEmailVerification({
    open,
    onCancel,
  })

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
              onChange={onCodeChange}
              // Mono: it is a code, read and typed digit by digit. The indent
              // matches the tracking, which otherwise trails after the last
              // digit and pulls the centred code off centre.
              className="h-11 indent-[0.5em] font-mono tracking-[0.5em] text-center text-lg tabular-nums"
              aria-invalid={!!error}
              aria-describedby={error ? "verify-code-error" : undefined}
            />
            {error && (
              <p id="verify-code-error" role="alert" className="text-xs text-fault-text">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {/* Enabled with a short code: a click then says what's missing
                instead of landing on a dead button. */}
            <Button type="submit" disabled={submitting} className="h-11 w-full">
              {submitting ? "Verifying…" : "Verify email"}
            </Button>
            {/* Ghost buttons rather than bare text: the same 36px target and
                focus ring as every other control, at one shared size. */}
            <div className="flex items-center justify-between w-full gap-2">
              <Button
                type="button"
                variant="ghost"
                className="-ml-2 text-muted-foreground"
                onClick={resend}
                disabled={resending}
              >
                {resending ? "Sending new code…" : "Resend code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="-mr-2 text-muted-foreground"
                onClick={dismiss}
              >
                Use a different account
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
