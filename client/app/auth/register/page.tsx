"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ds/Button"
import { PasswordField, TextField } from "@/components/ds/Field"
import { Notice } from "@/components/ds/Notice"
import { AuthCard, AuthFooter, AuthLink, CheckboxRow, OrRule } from "@/components/auth/AuthCard"
import { IconBrandGoogleFilled } from "@tabler/icons-react"
import axios from "@/lib/axios"
import { useRouter, useSearchParams } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { saveAuth, getUser } from "@/actions/auth"
import { signInWithGoogle } from "@/lib/google-auth"
import { VerifyEmailDialog } from "@/components/dashboard/account/VerifyEmailDialog"

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
      <Notice tone="onair" label="Invited" title={`You're invited to GoCast ${invite.plan}`}>
        {invite.durationDays
          ? `Sign up and your account is on ${invite.plan} for ${invite.durationDays} days, free.`
          : `Sign up and your account is on ${invite.plan}, free.`}
      </Notice>
    )
  }

  if (invite.status === "unchecked") {
    return (
      <Notice tone="onair" label="Invite" title="You have an invite link">
        We couldn&apos;t check it just now. Sign up anyway and it&apos;s applied if it&apos;s still valid.
      </Notice>
    )
  }

  return (
    <Notice tone="neutral" label="Invite" className="bg-surface-raised">
      {invite.status === "closed" && invite.reason === "used"
        ? "This invite link has already been used. You can still create a free account."
        : invite.status === "closed"
          ? "This invite link has expired. You can still create a free account."
          : "That invite link isn't valid. You can still create a free account."}
    </Notice>
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

/** Form field → input `name`, for putting a server error where it belongs. */
const FIELD_IDS: Record<string, string> = {
  name: "name",
  email: "email",
  password: "password",
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
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState("")
  const [googleLoading, setGoogleLoading] = useState(false)
  // Consent is explicit: the submit refuses until the box is ticked, and
  // says so under the box rather than in a toast.
  const [agreed, setAgreed] = useState(false)

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
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      newErrors.email = "Enter a full email address, like you@example.com."
    if (!password) newErrors.password = "Password is required."
    else if (password.length < 8)
      newErrors.password = "Password must be at least 8 characters."
    if (!agreed) newErrors.terms = "Please agree to the Terms and Privacy Policy to continue."
    return newErrors
  }

  async function handleGoogle() {
    if (!agreed) {
      setErrors((current) => ({ ...current, terms: "Please agree to the Terms and Privacy Policy to continue." }))
      return
    }
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

  // An error stays up only until the field it names is touched again.
  function clearError(field: string) {
    setErrors((current) => {
      if (!(field in current)) return current
      const rest = { ...current }
      delete rest[field]
      return rest
    })
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
        // No confirm field: Show on the one field is how you check what you
        // typed. The API's `confirmed` rule still wants the pair.
        password_confirmation: password,
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
        // Field errors go under their field. A toast alone vanished while the
        // form looked untouched, and people retyped their passwords and
        // resubmitted into the same error ("email already taken", mostly).
        const serverErrors = (errData?.errors ?? {}) as Record<string, string[]>
        const fieldErrors: Record<string, string> = {}
        // Errors with no field on the form (invite_code, mostly) still get a
        // toast, even when a field error arrives alongside them.
        const unmapped: string[] = []
        for (const [key, messages] of Object.entries(serverErrors)) {
          const field = key === "password_confirmation" ? "password" : key
          if (!messages[0]) continue
          if (field in FIELD_IDS) fieldErrors[field] = messages[0]
          else unmapped.push(messages[0])
        }
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors)
          document.querySelector<HTMLInputElement>(`input[name="${FIELD_IDS[Object.keys(fieldErrors)[0]]}"]`)?.focus()
          for (const message of unmapped) toast.error(message)
        } else {
          toast.error(unmapped[0] || errData?.message || "Registration failed")
        }
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Create your station"
      lead={inviteUsable ? "Create your account to claim your invite." : "Free, from a browser tab. About a minute."}
    >
      {invite && <InviteBanner invite={invite} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
        <TextField
          label="Name"
          name="name"
          type="text"
          placeholder="Your name"
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            clearError("name")
          }}
          error={errors.name}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            clearError("email")
          }}
          error={
            errors.email && (
              <>
                {errors.email}
                {/* The usual reason: they already signed up, maybe with Google. */}
                {/taken/i.test(errors.email) && (
                  <>
                    {" "}
                    <AuthLink href="/auth/login">Sign in instead</AuthLink>
                  </>
                )}
              </>
            )
          }
        />
        <PasswordField
          label="Password"
          name="password"
          placeholder="Choose a password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            clearError("password")
          }}
          error={errors.password}
          // The one rule, said before submit rather than after.
          hint="At least 8 characters."
        />
        <CheckboxRow
          checked={agreed}
          onCheckedChange={(next) => {
            setAgreed(next)
            if (next) clearError("terms")
          }}
          error={errors.terms}
        >
          I agree to the{" "}
          <AuthLink href="/terms">Terms</AuthLink> and{" "}
          <AuthLink href="/privacy">Privacy Policy</AuthLink>.
        </CheckboxRow>
        <Button
          type="submit"
          size="lg"
          full
          // Held while the invite lookup is in flight, so a fast submit
          // can't create a free account before the page knows there was a
          // plan to apply.
          disabled={loading || inviteChecking}
        >
          {loading ? "Creating your account…" : "Create a free station"}
        </Button>
      </form>

      <OrRule />

      <Button type="button" variant="ghost" size="lg" full onClick={handleGoogle} disabled={googleLoading}>
        <IconBrandGoogleFilled />
        {googleLoading ? "Signing up…" : "Continue with Google"}
      </Button>

      <AuthFooter>
        Already have an account? <AuthLink href="/auth/login">Sign in</AuthLink>
      </AuthFooter>

      <VerifyEmailDialog
        open={verifyOpen}
        email={verifyEmail}
        onCancel={() => setVerifyOpen(false)}
      />
    </AuthCard>
  )
}
