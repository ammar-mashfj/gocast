"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
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
import { useRouter, useSearchParams } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { saveAuth, getUser } from "@/actions/auth"
import { signInWithGoogle } from "@/lib/google-auth"
import { VerifyEmailDialog } from "@/components/auth/VerifyEmailDialog"
import { TrustCues } from "@/components/common/TrustCues"

/**
 * What `GET /api/invites/{code}` says about the code in the URL. `checking`
 * covers the round trip; `invalid` is a code the API has never heard of, as
 * opposed to one it knows and has closed. `unchecked` is a lookup that failed
 * for a reason unrelated to the code (a rate limit, a cold API, no network):
 * the code is still sent with the sign-up and the API has the final word,
 * rather than a real invitee silently ending up on a free account.
 */
type InviteState =
  | { status: "checking" }
  | { status: "valid"; plan: string; durationDays: number | null }
  | { status: "closed"; reason: "used" | "expired" }
  | { status: "invalid" }
  | { status: "unchecked" }

/**
 * The `code` field of an InviteException response, mapped onto the banner.
 * Used when the sign-up itself is refused, so the page stops sending a code
 * it now knows is dead instead of 422ing on every retry.
 */
function inviteStateFromError(code: unknown): InviteState | null {
  switch (code) {
    case "invite_used":
    case "invite_already_redeemed":
      return { status: "closed", reason: "used" }
    case "invite_expired":
      return { status: "closed", reason: "expired" }
    case "invite_not_found":
      return { status: "invalid" }
    default:
      return null
  }
}

function useInvite(code: string | null): [InviteState | null, (next: InviteState) => void] {
  const [state, setState] = useState<InviteState | null>(code ? { status: "checking" } : null)

  useEffect(() => {
    if (!code) return
    let cancelled = false

    axios
      .get(`/invites/${encodeURIComponent(code)}`)
      .then((res) => {
        if (cancelled) return
        const data = res.data.data
        if (data.redeemable) {
          setState({ status: "valid", plan: data.plan.name, durationDays: data.duration_days ?? null })
        } else {
          setState({ status: "closed", reason: data.reason === "expired" ? "expired" : "used" })
        }
      })
      .catch((error) => {
        if (cancelled) return
        // Only a 404 means the code is wrong. Anything else is the lookup
        // failing, which says nothing about the link.
        const notFound = error instanceof AxiosError && error.response?.status === 404
        setState(notFound ? { status: "invalid" } : { status: "unchecked" })
      })

    return () => {
      cancelled = true
    }
  }, [code])

  return [state, setState]
}

/**
 * Says what the link in the address bar is worth before anyone types. A dead
 * link is still allowed to sign up — it just makes a free account, and the
 * banner says so rather than letting them find out on the dashboard.
 */
function InviteBanner({ invite }: { invite: InviteState }) {
  if (invite.status === "checking") return null

  if (invite.status === "valid") {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
        <p className="font-medium">You&apos;re invited to GoCast {invite.plan}</p>
        <p className="text-muted-foreground">
          {invite.durationDays
            ? `Sign up and your account is on ${invite.plan} for ${invite.durationDays} days, free.`
            : `Sign up and your account is on ${invite.plan}, free.`}
        </p>
      </div>
    )
  }

  if (invite.status === "unchecked") {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
        <p className="font-medium">You have an invite link</p>
        <p className="text-muted-foreground">
          We couldn&apos;t check it just now. Sign up anyway and it&apos;s applied if it&apos;s still valid.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {invite.status === "closed" && invite.reason === "used"
        ? "This invite link has already been used. You can still create a free account."
        : invite.status === "closed"
          ? "This invite link has expired. You can still create a free account."
          : "That invite link isn't valid. You can still create a free account."}
    </div>
  )
}

export default function RegisterPage() {
  // useSearchParams needs a Suspense boundary in the app router; the form
  // itself has nothing to suspend on, so the fallback is never seen.
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The code from the emailed link. Sent back with the registration so the
  // plan is applied in the same transaction as the account; for a Google
  // sign-up it goes on the popup URL and the API redeems it in the callback.
  const inviteCode = searchParams.get("invite")
  const [invite, setInvite] = useInvite(inviteCode)
  // Sent while the banner says it works, or while nothing could be checked.
  // A code the page already knows is dead would otherwise block the sign-up
  // with a 422.
  const inviteUsable = invite?.status === "valid" || invite?.status === "unchecked"
  const inviteChecking = invite?.status === "checking"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState("")
  const [googleLoading, setGoogleLoading] = useState(false)

  // If the visitor already has a session cookie, don't let them register on
  // top of it. Verified → send them to the dashboard; unverified → surface
  // the verify modal on their existing account instead of creating a second.
  useEffect(() => {
    const existingUser = getUser()
    if (!existingUser) return

    if (existingUser.email_verified_at) {
      router.replace("/dashboard")
      return
    }

    setVerifyEmail(existingUser.email)
    setVerifyOpen(true)
  }, [router])

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!name) newErrors.name = "Name is required."
    if (!email) newErrors.email = "Email is required."
    if (!password) newErrors.password = "Password is required."
    else if (password.length < 8)
      newErrors.password = "Password must be at least 8 characters."
    if (password !== passwordConfirmation)
      newErrors.passwordConfirmation = "Passwords do not match."
    return newErrors
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      const result = await signInWithGoogle(inviteUsable && inviteCode ? { invite: inviteCode } : {})

      if ("dismissed" in result) return

      if ("error" in result) {
        toast.error(result.error === "popup_blocked"
          ? "Popup blocked. Enable popups and try again."
          : "Google sign-up failed. Please try again.")
        return
      }

      // The account exists either way. A miss here means the link was used
      // between page load and now, or the account already held a plan; say
      // so and carry on.
      if (result.invite) {
        if (result.invite.applied) {
          toast.success(result.invite.message)
        } else {
          toast.error(result.invite.message)
        }
      }

      const userRes = await axios.get("/user")
      saveAuth(null, userRes.data.data)
      toast.success("Welcome to GoCast")
      router.push("/dashboard")
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
      const response = await axios.post("/auth/register", {
        name,
        email,
        password,
        password_confirmation: passwordConfirmation,
        ...(inviteUsable && inviteCode ? { invite_code: inviteCode } : {}),
      })
      if (response.status === 200 || response.status === 201) {
        saveAuth(null, response.data.data)
        toast.success("Check your inbox for a 6-digit code")
        setVerifyEmail(response.data.data.email)
        setVerifyOpen(true)
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        const errData = error.response?.data
        // The link died between page load and submit (or was never real).
        // Remember that, so the next submit goes through without the code
        // and makes a free account instead of failing the same way again.
        const closedInvite = inviteStateFromError(errData?.code)
        if (closedInvite) setInvite(closedInvite)
        const fieldError = errData?.errors
          ? Object.values(errData.errors as Record<string, string[]>).flat()[0]
          : null
        toast.error(fieldError || errData?.message || "Registration failed")
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
        <CardTitle className="text-lg">Sign up</CardTitle>
        <CardDescription className="text-sm">
          {inviteUsable
            ? "Create your account to claim your invite."
            : "Get started with your free GoCast account."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {invite && (
          <div className="mb-4">
            <InviteBanner invite={invite} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

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
            <Label htmlFor="password">
              Password
            </Label>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password-confirmation">
              Confirm password
            </Label>
            <Input
              id="password-confirmation"
              type="password"
              placeholder="********"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              aria-invalid={!!errors.passwordConfirmation}
            />
            {errors.passwordConfirmation && (
              <p className="text-xs text-destructive">
                {errors.passwordConfirmation}
              </p>
            )}
          </div>

          <Button
            type="submit"
            // Held while the invite lookup is in flight, so a fast submit
            // can't create a free account before the page knows there was a
            // plan to apply.
            disabled={loading || inviteChecking}
            className="mt-1 w-full"
          >
            {loading ? "Signing up…" : "Sign up"}
          </Button>
        </form>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-sm text-muted-foreground">or</span>
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
          {googleLoading ? "Signing up…" : "Continue with Google"}
        </Button>

        <TrustCues variant="stacked" className="mt-5" />
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>.
        </p>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-primary underline-offset-4 hover:underline text-sm"
          >
            Sign in
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
