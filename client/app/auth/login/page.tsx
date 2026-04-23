"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { IconBrandGoogleFilled } from "@tabler/icons-react"
import axios from "@/lib/axios"
import { saveAuth, getUser } from "@/actions/auth"
import { signInWithGoogle } from "@/lib/google-auth"
import { VerifyEmailDialog } from "@/components/auth/VerifyEmailDialog"


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

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifyEmail(existingUser.email)
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription className="text-sm">
          Enter your credentials to access your account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/auth/forgot"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-sm text-muted-foreground">Or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={googleLoading}
        >
          <IconBrandGoogleFilled />
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </Button>
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          By signing in with Google, you agree to our{" "}
          <Link href="/terms" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>.
        </p>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/register"
            className="text-primary underline-offset-4 hover:underline text-sm"
          >
            Sign up
          </Link>
        </p>
      </CardFooter>

      <VerifyEmailDialog
        open={verifyOpen}
        email={verifyEmail}
        onCancel={() => setVerifyOpen(false)}
      />
    </Card>
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
