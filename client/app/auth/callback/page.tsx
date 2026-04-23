"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { IconLoader2 } from "@tabler/icons-react"
import { Card, CardContent } from "@/components/ui/card"
import { saveAuth } from "@/actions/auth"
import { env } from "@/lib/env"

function CallbackFallback() {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center text-center py-10 gap-3">
        <IconLoader2 size={24} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </CardContent>
    </Card>
  )
}

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const authenticated = params.get("authenticated") === "1"
    const error = params.get("error")

    if (error) {
      toast.error("Google sign-in failed. Please try again.")
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
