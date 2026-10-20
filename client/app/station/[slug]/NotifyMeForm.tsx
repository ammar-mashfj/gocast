"use client"

import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { IconCheck, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Input } from "@/components/ds/Field"
import { env } from "@/lib/env"

const STORAGE_KEY = "gocast:notify-subscribed:v1"

function rememberSubscribed(slug: string) {
  if (typeof window === "undefined") return
  try {
    const set = new Set<string>(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"))
    set.add(slug)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

function alreadySubscribed(slug: string): boolean {
  if (typeof window === "undefined") return false
  try {
    const arr = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(arr) && arr.includes(slug)
  } catch {
    return false
  }
}

/**
 * Email capture inside the off-air player card. Posts to a tightly
 * throttled public endpoint that creates an idempotent subscription
 * (no duplicates per email + station). Dispatch happens later from the
 * "station went live" event handler.
 */
export function NotifyMeForm({ slug, stationName }: { slug: string; stationName: string }) {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Read after mount, not in the initializer: the player page is server
  // rendered now, and the server has no localStorage — an initializer that
  // reads it renders "subscribed" in the browser and "not" in the HTML,
  // which is a hydration mismatch.
  useEffect(() => {
    if (alreadySubscribed(slug)) setDone(true)
  }, [slug])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${env.apiUrl}/public/stations/${slug}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message ?? "Couldn't sign up — try again in a minute.")
      }
      setDone(true)
      rememberSubscribed(slug)
      toast.success(`We'll email you when ${stationName} goes live.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign up — try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-ok-text">
        <IconCheck size={16} className="shrink-0" />
        You&apos;ll get an email when this station next goes live.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <Input
        id={`notify-${slug}`}
        type="email"
        required
        autoComplete="email"
        aria-label="Your email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={submitting}
        className="flex-1"
      />
      <Button type="submit" size="md" disabled={submitting || !email} className="h-11">
        {submitting ? <IconLoader2 className="animate-spin" /> : "Notify me"}
      </Button>
    </form>
  )
}
