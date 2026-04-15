"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { saveAuth } from "@/actions/auth"
import { env } from "@/lib/env"

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token = params.get("token")
    const error = params.get("error")

    if (error) {
      toast.error("Google sign-in failed. Please try again.")
      router.replace("/auth/login")
      return
    }

    if (!token) {
      router.replace("/auth/login")
      return
    }

    fetch(`${env.apiUrl}/user`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user")
        return res.json()
      })
      .then((res) => {
        saveAuth(token, res.data)
        toast.success("Signed in successfully")
        router.replace("/dashboard")
      })
      .catch(() => {
        toast.error("Something went wrong. Please try again.")
        router.replace("/auth/login")
      })
  }, [])

  return null
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
