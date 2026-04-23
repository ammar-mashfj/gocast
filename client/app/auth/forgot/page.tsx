"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { IconArrowLeft } from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
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
    if (password !== passwordConfirmation) newErrors.passwordConfirmation = "Passwords do not match."
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setSubmitting(true)
    try {
      await api.post("/auth/password/reset", {
        email,
        code,
        password,
        password_confirmation: passwordConfirmation,
      })
      toast.success("Password reset. Sign in with your new password.")
      router.replace("/auth/login")
    } catch (err) {
      if (err instanceof AxiosError) {
        const fieldErrors = err.response?.data?.errors
        if (fieldErrors) {
          const flat: Record<string, string> = {}
          for (const key of Object.keys(fieldErrors)) {
            flat[key === "password_confirmation" ? "passwordConfirmation" : key] = fieldErrors[key][0]
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">
          {step === "request" ? "Forgot your password?" : "Enter your reset code"}
        </CardTitle>
        <CardDescription className="text-sm">
          {step === "request"
            ? "Enter the email on your account and we'll send you a 6-digit reset code."
            : <>We sent a code to <span className="text-foreground font-medium">{email}</span>. Enter it below with your new password.</>}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === "request" ? (
          <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
                autoComplete="email"
                autoFocus
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Sending…" : "Send reset code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitReset} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Verification code</Label>
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
                className="tracking-[0.5em] text-center text-lg"
                aria-invalid={!!errors.code}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                autoComplete="new-password"
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password-confirmation">Confirm new password</Label>
              <Input
                id="password-confirmation"
                type="password"
                placeholder="Repeat new password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                aria-invalid={!!errors.passwordConfirmation}
                autoComplete="new-password"
              />
              {errors.passwordConfirmation && <p className="text-xs text-destructive">{errors.passwordConfirmation}</p>}
            </div>

            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Resetting…" : "Reset password"}
            </Button>

            <button
              type="button"
              onClick={resendCode}
              disabled={submitting}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-60 self-center"
            >
              Resend code
            </button>
          </form>
        )}
      </CardContent>

      <CardFooter className="justify-center">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconArrowLeft size={14} />
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  )
}
