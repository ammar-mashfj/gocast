"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import api from "@/lib/axios"

interface Props {
  plan: string
  className?: string
  children: React.ReactNode
}

export default function WaitlistButton({ plan, className, children }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.")
      return
    }

    setSubmitting(true)
    try {
      await api.post("/waitlist", { email, plan })
      setSubmitted(true)
      toast.success("You're on the list! We'll email you when Pro is ready.")
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined
      if (status === 429) {
        setError("Too many attempts. Please try again later.")
      } else if (status === 422) {
        setError("Please check the email address and try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setEmail("")
      setError(null)
      setSubmitted(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className={className}>
          {children}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join the Pro waitlist</DialogTitle>
          <DialogDescription>
            Enter your email and we&apos;ll notify you when Pro launches.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="py-4 text-sm text-text-muted">
            You&apos;re on the list! We&apos;ll email you when Pro is ready.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-faint focus:outline-none focus:border-violet-border/70"
              disabled={submitting}
            />
            {error && <div className="text-[12px] text-red-400">{error}</div>}
            <DialogFooter>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg text-[13px] font-medium bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Join the waitlist"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
