"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { IconLoader2 } from "@tabler/icons-react"
import { Card } from "@/components/ds/Card"
import { saveAuth } from "@/actions/auth"
import { env } from "@/lib/env"

function CallbackFallback() {
  return (
    <Card className="w-full max-w-sm items-center gap-3 py-10 text-center sm:p-7 sm:py-10">
      <IconLoader2 size={24} className="animate-spin text-on-air-text" />
      <p className="text-body text-muted-foreground">Signing you in…</p>
    </Card>
  )
}

/**
 * The refusals the API names (GoogleSignInRefused). The popup gets the
 * message itself; this full-page fallback only gets `?error=`, so the same
 * words live here too.
 */
const REFUSALS: Record<string, string> = {
  disposable_email: "Please use a permanent email address. Temporary inboxes can’t be used to sign up.",
  google_email_unverified: "Google hasn’t confirmed this email address, so it can’t be linked to your GoCast account. Sign in with your password instead.",
}

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const authenticated = params.get("authenticated") === "1"
    const error = params.get("error")

    if (error) {
      toast.error(REFUSALS[error] ?? "Google sign-in failed. Please try again.")
      router.replace("/auth/login")
      return
    }

    if (!authenticated) {
      router.replace("/auth/login")
      return
    }

    fetch(`${env.apiUrl}/user`, {
      signal: AbortSignal.timeout(10000),
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user")
        return res.json()
      })
      .then((res) => {
        saveAuth(null, res.data)
        toast.success("Welcome back")
        router.replace("/dashboard")
      })
      .catch(() => {
        toast.error("Something went wrong. Please try again.")
        router.replace("/auth/login")
      })
    // OAuth callback only runs once on mount; deps would re-fire and re-auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render the same fallback while the request is in flight so the user
  // sees consistent feedback throughout the OAuth landing.
  return <CallbackFallback />
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <CallbackHandler />
    </Suspense>
  )
}
