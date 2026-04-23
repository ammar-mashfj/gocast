"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { IconBell, IconCheck, IconLoader2 } from "@tabler/icons-react"
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
 * Email capture shown only when a station is off air. Posts to a tightly
 * throttled public endpoint that creates an idempotent subscription
 * (no duplicates per email + station). Dispatch happens later from the
 * "station went live" event handler.
 */
export function NotifyMeForm({ slug, stationName }: { slug: string; stationName: string }) {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(() => alreadySubscribed(slug))

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
      <div className="flex items-center gap-2 text-xs text-emerald-300 mt-3 max-w-[280px]">
        <IconCheck size={14} />
        <span>You&apos;ll get an email when this station next goes live.</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 mt-3 max-w-[300px] w-full">
      <label htmlFor={`notify-${slug}`} className="text-xs tracking-[2px] uppercase text-muted-foreground flex items-center gap-1.5">
        <IconBell size={14} />
        Notify me when live
      </label>
      <div className="flex gap-1.5">
        <input
          id={`notify-${slug}`}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-text-faint focus:outline-none focus:border-violet-border/70 transition-colors"
        />
        <button
          type="submit"
          disabled={submitting || !email}
          className="px-3 py-1.5 rounded-md bg-violet-full text-white text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {submitting ? <IconLoader2 size={14} className="animate-spin" /> : "Notify me"}
        </button>
      </div>
    </form>
  )
}
