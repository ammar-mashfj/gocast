"use client"

import { useEffect, useState } from "react"
import type { Plan } from "@/interfaces/Plan"
import { usePlan } from "@/contexts/AccountContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { ProTag } from "@/components/ds/Tag"
import { billingError, cancelLavaMembership, fetchLavaStatus, type LavaStatus } from "@/lib/billing"

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

/**
 * Which plan this account is on. Pro is the amber card (amber = Pro); Free is
 * a plain card with Get Pro, which opens checkout. A time-limited plan (a
 * paid term or an invite) says when it ends. There is no way to add time
 * before it does yet: that comes back when it can be done properly.
 * Renders nothing until the plan is known, rather than guessing Free at a
 * paying customer.
 *
 * A card membership (lava.top) that still renews says so instead of an end
 * date, with "Turn off auto-renew": lava.top stops charging, and Pro stays on
 * until the end of the month already paid for.
 */
export function PlanCard() {
  const plan = usePlan()
  const checkout = useProCheckout()
  const [membership, setMembership] = useState<LavaStatus["membership"]>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pro = plan !== null && plan.slug !== "free"

  useEffect(() => {
    if (!pro) return
    let live = true
    fetchLavaStatus()
      .then((status) => live && setMembership(status.membership))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pro])

  async function turnOffAutoRenew() {
    setBusy(true)
    setError(null)
    try {
      await cancelLavaMembership()
      setMembership((m) => m && { ...m, status: "cancelled", renews: false })
      setConfirming(false)
    } catch (err) {
      setError(billingError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!plan) return null

  const renews = pro && membership?.renews === true
  const ends = plan.expires_at
    ? new Date(plan.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <Card tone={pro ? "pro" : "card"} className="gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-center gap-2.5">
          {pro && <ProTag />}
          <span className="font-display text-title-sm text-foreground">You’re on {plan.name}</span>
        </span>
        <span className="text-body-sm text-muted-foreground">
          {planIncludes(plan)}
          {renews && " Renews every month."}
          {ends && !renews && ` Ends ${ends}, then your account moves to Free.`}
          {!pro && " Your station plays only while you’re live."}
        </span>
      </div>
      {!pro && (
        <Button variant="pro" className="shrink-0 self-start sm:self-auto" onClick={() => checkout.open()}>
          Get Pro
        </Button>
      )}
      {renews && (
        <Button variant="subtle" className="shrink-0 self-start sm:self-auto" onClick={() => setConfirming(true)}>
          Turn off auto-renew
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(next) => {
          setConfirming(next)
          if (!next) setError(null)
        }}
        onConfirm={turnOffAutoRenew}
        busy={busy}
        title="Turn off auto-renew?"
        description={
          <>
            We won’t charge you again.{ends ? ` ${plan.name} stays on until ${ends}, then your account moves to Free.` : ""}
            {error && <span className="mt-2 block text-fault-text">{error}</span>}
          </>
        }
        confirmLabel="Turn off auto-renew"
        keepLabel="Keep renewing"
      />
    </Card>
  )
}
