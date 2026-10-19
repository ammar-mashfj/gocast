"use client"

import { useState } from "react"
import { IconCheck } from "@tabler/icons-react"
import { ProPrice, useProPriceShort, useYearlyLine } from "@/components/dashboard/billing/ProPrice"
import { usePlan } from "@/contexts/AccountContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { PRO_FEATURES } from "@/interfaces/Plan"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { ActionRow } from "@/components/ds/List"
import { ProTag } from "@/components/ds/Tag"

/**
 * The overview's Pro upsell, for Free accounts only (nothing while the plan
 * is unknown — never guess Free). Opens what Pro adds and costs; its button
 * hands on to checkout (ProCheckoutContext).
 */
export function GetProTile({ className }: { className?: string }) {
  const plan = usePlan()
  const [open, setOpen] = useState(false)
  const price = useProPriceShort()
  if (!plan || plan.slug !== "free") return null

  return (
    <>
      <ActionRow
        title={<span className="inline-flex items-center gap-2">Get Pro <ProTag /></span>}
        description={`AutoDJ, encoders and analytics${price ? ` · ${price}` : ""}`}
        onClick={() => setOpen(true)}
        className={cn("bg-pro-tint hover:bg-pro-tint/80", className)}
      />
      <GetProDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function GetProDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const checkout = useProCheckout()
  const yearly = useYearlyLine()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <ProTag className="self-start" />
          <DialogTitle>What Pro adds</DialogTitle>
          <DialogDescription>Everything in Free, plus:</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 border-t border-line py-2.5 text-body-sm">
              <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-fault-text" />
              {f}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <ProPrice />
          {yearly && (
            <span className="text-sm text-muted-foreground">
              or <span className="font-semibold text-foreground">{yearly.price} / year</span>, save {yearly.saving}
            </span>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Not now</Button>
          </DialogClose>
          <Button
            variant="pro"
            onClick={() => {
              onOpenChange(false)
              checkout.open()
            }}
          >
            Get Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Four of the eight, the ones a Free station feels the lack of first. */
const HIGHLIGHTS = [PRO_FEATURES[0], PRO_FEATURES[2], PRO_FEATURES[4], PRO_FEATURES[6]]

/**
 * The big Pro card under the hero, tablet and PC, Free only (the caller
 * decides). `wide`: the full-width version for a station with no shows yet,
 * features in two columns and the price beside them; otherwise the narrow
 * column beside the shows chart.
 */
export function ProFeaturesCard({ wide = false, className }: { wide?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Card tone="pro" className={cn("gap-5", className)}>
      <div className="flex flex-col gap-2">
        <ProTag className="self-start" />
        <h2 className="font-display text-title-sm text-foreground text-balance">Keep your station playing when you’re not live</h2>
      </div>
      <div className={cn("flex flex-col gap-5", wide && "md:flex-row md:items-end md:justify-between")}>
        <ul className={cn("grid gap-x-6 gap-y-2", wide && "md:grid-cols-2")}>
          {HIGHLIGHTS.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-body-sm">
              <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
        <div className={cn("flex items-center justify-between gap-4", wide && "md:shrink-0 md:justify-end")}>
          <ProPrice amountClassName="font-display text-title text-foreground" unitClassName="text-sm" />
          <Button variant="pro" onClick={() => setOpen(true)}>Get Pro</Button>
        </div>
      </div>
      <GetProDialog open={open} onOpenChange={setOpen} />
    </Card>
  )
}
