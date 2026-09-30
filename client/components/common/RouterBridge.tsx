"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { registerNavigator } from "@/lib/navigation"

/** Mounts once in the root layout; renders nothing. See lib/navigation.ts. */
export function RouterBridge() {
  const router = useRouter()

  useEffect(() => {
    registerNavigator((href) => router.replace(href))
    return () => registerNavigator(null)
  }, [router])

  return null
}
