"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { Button } from "@/components/ds/Button"
import { PasswordField, TextField } from "@/components/ds/Field"
import { AuthCard, AuthFooter, AuthLink, OrRule } from "@/components/auth/AuthCard"
import { IconBrandGoogleFilled } from "@tabler/icons-react"
import axios from "@/lib/axios"
import { saveAuth, getUser } from "@/actions/auth"
import { signInWithGoogle } from "@/lib/google-auth"
import { VerifyEmailDialog } from "@/components/dashboard/account/VerifyEmailDialog"


function ExpiredToast() {
  const searchParams = useSearchParams()
  // Triggered by the axios 401 interceptor when a session expires mid-use.
  useEffect(() => {
    if (searchParams.get("expired") === "1") {
      toast.info("Your session expired. Please sign in again.")
    }
  }, [searchParams])
  return null
}

function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState("")
  const [googleLoading, setGoogleLoading] = useState(false)

  // If the visitor arrives with a dangling session (token cookie from an
  // unverified signup days ago), surface the verify modal immediately instead
  // of making them re-enter credentials. Verified sessions are sent straight
  // to the dashboard.
  useEffect(() => {
    const existingUser = getUser()
    if (!existingUser) return

    if (existingUser.email_verified_at) {
      router.replace("/dashboard/stations")
      return
    }

    setVerifyEmail(existingUser.email)
    setVerifyOpen(true)
  }, [router])

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!email) newErrors.email = "Email is required."
    if (!password) newErrors.password = "Password is required."
    return newErrors
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      const result = await signInWithGoogle()

      if ("dismissed" in result) {
        // User closed the popup — silent, nothing to do.
        return
      }

      if ("error" in result) {
        toast.error(result.error === "popup_blocked"
          ? "Popup blocked. Enable popups and try again."
          : "Google sign-in failed. Please try again.")
        return
      }

      // Exchange the HttpOnly auth cookie for the user record so we can
      // populate the non-sensitive display cookie.
      // Google users are auto-verified server-side, so no dialog path.
      const userRes = await axios.get("/user")
      saveAuth(null, userRes.data.data)
      toast.success("Welcome back")
      router.push("/dashboard/stations")
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const newErrors = validate()
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setLoading(true)
    try {
      const response = await axios.post("/auth/login", { email, password })
      if (response.status === 200) {
        saveAuth(null, response.data.data)
        const verified = Boolean(response.data.data?.email_verified_at)
        if (verified) {
          toast.success("Welcome back")
          router.push("/dashboard/stations")
          return
        }
        // Unverified: stay on the login page and surface the modal so the
        // dashboard is never reachable with an unverified session.
        setVerifyEmail(response.data.data.email)
        setVerifyOpen(true)
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        toast.error(error.response?.data?.message || "Invalid credentials")
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Sign in" lead="Welcome back. Your station is where you left it.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <AuthLink href="/auth/forgot" className="self-end text-body-sm">
          Forgot password?
        </AuthLink>
        <Button type="submit" size="lg" full disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <OrRule />

      <Button type="button" variant="ghost" size="lg" full onClick={handleGoogle} disabled={googleLoading}>
        <IconBrandGoogleFilled />
        {googleLoading ? "Signing in…" : "Continue with Google"}
      </Button>
      {/* Google signs a new visitor up from here too (the API creates the
          account), so this is where they're shown the Terms: the sign-up
          page's checkbox never sees them. */}
      <p className="text-center text-caption text-text-faint">
        By continuing with Google, you agree to the{" "}
        <AuthLink href="/terms">Terms</AuthLink> and{" "}
        <AuthLink href="/privacy">Privacy Policy</AuthLink>.
      </p>

      <AuthFooter>
        Don&apos;t have an account? <AuthLink href="/auth/register">Create one free</AuthLink>
      </AuthFooter>

      <VerifyEmailDialog
        open={verifyOpen}
        email={verifyEmail}
        onCancel={() => setVerifyOpen(false)}
      />
    </AuthCard>
  )
}

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <ExpiredToast />
      </Suspense>
      <LoginForm />
    </>
  )
}
