"use client"

import type { Plan } from "@/interfaces/Plan"
import { usePlan } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
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

/**
 * Which plan this account is on. Pro is the amber card (amber = Pro); Free is
 * a plain card with Request Pro, since Pro is granted by hand and there is no
 * billing to manage. A time-limited plan (an invite) says when it ends.
 * Renders nothing until the plan is known, rather than guessing Free at a
 * paying customer.
 */
export function PlanCard() {
  const plan = usePlan()
  const proRequest = useProRequest()
  if (!plan) return null

  const pro = plan.slug !== "free"
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
          {ends && ` Ends ${ends}, then your account moves to Free.`}
          {!pro && " Your station plays only while you’re live."}
        </span>
      </div>
      {!pro && (
        // "Request", not "Upgrade": Pro is granted by hand.
        <Button variant="pro" className="shrink-0 self-start sm:self-auto" onClick={proRequest.open} disabled={proRequest.requested}>
          {proRequest.requested ? "Request sent" : "Request Pro"}
        </Button>
      )}
    </Card>
  )
}
