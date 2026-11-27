"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Plan } from "@/interfaces/Plan"
import { usePlan } from "@/contexts/AccountContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { billingError, cancelSubscription } from "@/lib/billing"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { ProTag } from "@/components/ds/Tag"

/** What the plan includes, from its own flags: never a list written by hand. */
export function planIncludes(plan: Plan): string {
  const parts = [`Up to ${plan.max_listeners.toLocaleString("en-GB")} listeners at once`]
  if (plan.autodj_enabled) parts.push("AutoDJ")
  if (plan.embed_enabled) parts.push("embeds")
  if (plan.encoder_enabled) parts.push("your own DJ software")
  if (plan.analytics_days > 0) parts.push(`${plan.analytics_days} days of audience history`)
  const last = parts.pop()!
  return parts.length ? `${parts.join(", ")} and ${last}.` : `${last}.`
}

/** "26 Dec 2026". */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Whole days from now until `iso`, counting a part day as one. */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

/** "You still have Pro for 3 days, until 30 Nov 2026." Singular for one day, and no count when under a day is left. */
function proLeft(iso: string): string {
  const days = daysUntil(iso)
  const day = formatDay(iso)
  if (days <= 1) return `You still have Pro until ${day}.`
  return `You still have Pro for ${days} days, until ${day}.`
}

/**
 * Which plan this account is on. Pro is the amber card (amber = Pro); Free is
 * a plain card with Get Pro, which opens checkout. A time-limited plan (a
 * paid term or an invite) says when it ends.
 *
 * A lava.top monthly subscriber gets Cancel subscription instead: after a
 * confirm it stops the charges, and Pro runs to the end of what was paid for.
 * Renders nothing until the plan is known, rather than guessing Free at a
 * paying customer.
 */
export function PlanCard() {
  const plan = usePlan()
  const checkout = useProCheckout()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState<{ until: string | null } | null>(null)
  if (!plan) return null

  const pro = plan.slug !== "free"
  const subscribed = pro && plan.subscribed === true && cancelled === null
  const ends = plan.expires_at ? formatDay(plan.expires_at) : null

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      const { pro_until } = await cancelSubscription()
      setCancelled({ until: pro_until })
      setConfirming(false)
      router.refresh()
    } catch (err) {
      setError(billingError(err))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone={pro ? "pro" : "card"} className="gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center gap-2.5">
            {pro && <ProTag />}
            <span className="font-display text-title-sm text-foreground">You’re on {plan.name}</span>
          </span>
          <span className="text-body-sm text-muted-foreground">
            {planIncludes(plan)}
            {subscribed ? " Billed monthly." : ends && ` Ends ${ends}, then your account moves to Free.`}
            {!pro && " Your station plays only while you’re live."}
          </span>
        </div>
        {!pro && (
          <Button variant="pro" className="shrink-0 self-start sm:self-auto" onClick={() => checkout.open()}>
            Get Pro
          </Button>
        )}
        {subscribed && (
          <Button variant="subtle" className="shrink-0 self-start sm:self-auto" onClick={() => setConfirming(true)}>
            Cancel subscription
          </Button>
        )}
      </div>

      {cancelled && (
        <p role="status" className="text-body text-foreground">
          {cancelled.until
            ? `Your subscription is cancelled. ${proLeft(cancelled.until)}`
            : "Your subscription is cancelled. You won’t be charged again."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body text-fault-text">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !busy && setConfirming(open)}
        onConfirm={cancel}
        busy={busy}
        title="Cancel your subscription?"
        description={
          plan.expires_at
            ? `You won’t be charged again. You keep Pro until ${formatDay(plan.expires_at)}, then your account moves to Free.`
            : "You won’t be charged again."
        }
        confirmLabel="Cancel subscription"
        keepLabel="Keep subscription"
      />
    </Card>
  )
}
