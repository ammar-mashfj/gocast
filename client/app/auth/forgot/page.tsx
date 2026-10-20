"use client"

import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { IconArrowLeft } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Input, PasswordField, TextField } from "@/components/ds/Field"
import { AuthCard, AuthLink } from "@/components/auth/AuthCard"
import api from "@/lib/axios"

type Step = "request" | "reset"

/**
 * Two-step password reset:
 *   1. "request" — user enters their email; API issues a 6-digit code (the
 *      response is always 200 regardless of whether the email exists, so we
 *      just move to step 2 and let them try the code).
 *   2. "reset" — user enters the code + a new password. On success, send
 *      them to /auth/login where they can sign in with the new credentials.
 */
export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("request")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  async function requestCode(e: FormEvent) {
    e.preventDefault()
    if (!email) {
      setErrors({ email: "Email is required." })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await api.post("/auth/password/forgot", { email })
      toast.success("If that email is registered, we've sent a code.")
      setStep("reset")
      // Focus the code input once the step switches so the user doesn't
      // have to click after the toast.
      requestAnimationFrame(() => codeInputRef.current?.focus())
    } catch (err) {
      if (err instanceof AxiosError) {
        const fieldError = err.response?.data?.errors?.email?.[0]
        toast.error(fieldError || err.response?.data?.message || "Couldn't send code.")
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (code.length !== 6) newErrors.code = "Enter the 6-digit code."
    if (password.length < 8) newErrors.password = "Password must be at least 8 characters."
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setSubmitting(true)
    try {
      await api.post("/auth/password/reset", {
        email,
        code,
        password,
        // No confirm field (Show does that job); the API still wants the pair.
        password_confirmation: password,
      })
      toast.success("Password reset. Sign in with your new password.")
      router.replace("/auth/login")
    } catch (err) {
      if (err instanceof AxiosError) {
        const fieldErrors = err.response?.data?.errors
        if (fieldErrors) {
          const flat: Record<string, string> = {}
          for (const key of Object.keys(fieldErrors)) {
            flat[key === "password_confirmation" ? "password" : key] = fieldErrors[key][0]
          }
          setErrors(flat)
        } else {
          toast.error(err.response?.data?.message || "Reset failed.")
        }
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function resendCode() {
    setSubmitting(true)
    try {
      await api.post("/auth/password/forgot", { email })
      toast.success("New code sent. Check your inbox.")
      setCode("")
    } catch {
      toast.error("Couldn't send a new code. Try again in a minute.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title={step === "request" ? "Forgot your password?" : "Enter your reset code"}
      lead={
        step === "request" ? (
          <span key="request">Enter the email on your account and we&apos;ll send you a 6-digit reset code.</span>
        ) : (
          <span key="reset">
            We sent a code to <span className="font-semibold text-foreground">{email}</span>. Enter it below with your new password.
          </span>
        )
      }
    >
      {step === "request" ? (
        <form onSubmit={requestCode} className="flex flex-col gap-3.5" noValidate>
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <Button type="submit" size="lg" full disabled={submitting}>
            {submitting ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="flex flex-col gap-3.5" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-body-sm font-semibold text-muted-foreground">
              Reset code
            </label>
            <Input
              ref={codeInputRef}
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
                setCode(digits)
                if (errors.code) setErrors((prev) => ({ ...prev, code: "" }))
              }}
              className="h-13 text-center font-mono text-meter-sm tabular-nums code-spaced"
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? "code-error" : undefined}
            />
            {errors.code && (
              <p id="code-error" role="alert" className="px-1 text-body-sm text-error">
                {errors.code}
              </p>
            )}
          </div>

          <PasswordField
            label="New password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />

          <Button type="submit" size="lg" full disabled={submitting}>
            {submitting ? "Resetting…" : "Reset password"}
          </Button>
          <Button type="button" variant="quiet" size="md" onClick={resendCode} disabled={submitting} className="self-center">
            Resend code
          </Button>
        </form>
      )}

      <AuthLink href="/auth/login" className="inline-flex items-center gap-1.5 self-center text-body-sm text-muted-foreground">
        <IconArrowLeft size={14} />
        Back to sign in
      </AuthLink>
    </AuthCard>
  )
}
