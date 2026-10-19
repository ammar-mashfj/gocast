"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { billingError, fetchPayment, formatUsd, type PaymentStatus } from "@/lib/billing"

/**
 * How often to ask while the payment is in flight, and for how long at most.
 * The cap only has to outlast the invoice (60 minutes by default): once it
 * lapses the API reports `expired` and polling stops by itself.
 */
const POLL_MS = 4000
const POLL_FOR_MS = 3 * 60 * 60 * 1000

/**
 * A payment's progress, from the moment Pay created the invoice until Pro is
 * granted. Opened two ways:
 * - from checkout (`startedUrl` set): "Your payment is ready", with a real
 *   link that opens OxaPay in a new tab, then "Waiting for your payment"
 *   here while they pay there. This tab never leaves the dashboard, so a
 *   live show keeps going.
 * - from `?payment=<uuid>`, where OxaPay sends the buyer back (in that new
 *   tab).
 *
 * Polls rather than listening, because the grant is written by a webhook
 * that may arrive before or minutes after the buyer pays, and a chain
 * confirmation can take a while. It also asks again the moment this tab is
 * shown, since that is usually right after paying in the other one. Once
 * granted it refreshes the route so the layout re-reads the plan, and every
 * Pro upsell on the page goes away.
 *
 * Mounted with `key={uuid}` so a second payment starts from a clean state.
 */
export function PaymentStatusDialog({
  uuid,
  startedUrl,
  onClose,
}: {
  uuid: string | null
  startedUrl?: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<PaymentStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)
  const refreshed = useRef(false)

  useEffect(() => {
    if (!uuid) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight = false
    let done = false
    const started = Date.now()

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer)
      timer = Date.now() - started < POLL_FOR_MS ? setTimeout(tick, ms) : undefined
    }

    const tick = async () => {
      if (inFlight || done) return
      inFlight = true
      try {
        const next = await fetchPayment(uuid)
        if (!live) return
        setStatus(next)
        setError(null)
        if (next.state === "granted" && !refreshed.current) {
          refreshed.current = true
          router.refresh()
        }
        if (next.state === "pending" || next.state === "confirming") schedule(POLL_MS)
        else done = true
      } catch (err) {
        if (!live) return
        setError(billingError(err))
        schedule(POLL_MS * 2)
      } finally {
        inFlight = false
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick()
    }

    void tick()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      live = false
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [uuid, router])

  // The link exists only while the invoice can still be paid.
  const pending = status === null || status.state === "pending"
  const paymentUrl = pending ? (status?.payment_url ?? startedUrl ?? null) : null
  const ready = Boolean(startedUrl) && !opened && pending
  const copy = ready ? readyCopy(status) : describe(status)

  return (
    <Dialog open={uuid !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <StatusLamp tone={copy.tone} size="sm" className="self-start">
            {copy.lamp}
          </StatusLamp>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {error && !status && !ready && (
          <p role="alert" className="text-body-sm text-fault-text">
            {error}
          </p>
        )}
        <DialogFooter>
          {ready && paymentUrl ? (
            <>
              <Button size="lg" variant="ghost" onClick={onClose}>
                Not now
              </Button>
              <Button size="lg" variant="pro" asChild>
                <a href={paymentUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
                  Open payment page ↗
                </a>
              </Button>
            </>
          ) : (
            <>
              {paymentUrl && (
                <Button size="lg" variant="ghost" asChild>
                  <a href={paymentUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
                    Reopen payment page ↗
                  </a>
                </Button>
              )}
              <Button size="lg" variant={status?.state === "granted" ? "pro" : "subtle"} onClick={onClose}>
                {status?.state === "granted" ? "Start using Pro" : "Close"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Copy = { tone: "onair" | "warn" | "off"; lamp: string; title: string; body: string }

/** Checkout just made the invoice; nothing has been paid. */
function readyCopy(status: PaymentStatus | null): Copy {
  const what = status ? `${status.product_name} · ${formatUsd(status.amount_usd)}. ` : ""
  return {
    tone: "off",
    lamp: "Ready",
    title: "Your payment is ready",
    body: `${what}It opens on OxaPay in a new tab. Keep this tab open: it updates by itself once the payment arrives.`,
  }
}

function describe(status: PaymentStatus | null): Copy {
  if (!status) return { tone: "off", lamp: "Checking", title: "Checking your payment…", body: "One moment." }

  const what = `${status.product_name} · ${formatUsd(status.amount_usd)}`
  const until = status.granted_until
    ? new Date(status.granted_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null

  switch (status.state) {
    case "granted":
      return {
        tone: "onair",
        lamp: "Paid",
        title: "You’re on Pro",
        body: until
          ? `${what}. Thanks! It runs until ${until}, and we’ll email you a week before it ends.`
          : `${what}. Thanks! It has no end date, so there’s nothing to renew.`,
      }
    case "confirming":
      return {
        tone: "warn",
        lamp: "Confirming",
        title: "Payment received, confirming it",
        body: `${what}. Your payment is being confirmed. That usually takes a few minutes. You can close this; Pro switches on by itself.`,
      }
    case "expired":
      return {
        tone: "off",
        lamp: "Expired",
        title: "This payment link has expired",
        body: "Nothing was charged. Open Get Pro again to start a new one.",
      }
    case "attention":
      return {
        tone: "warn",
        lamp: "Checking",
        title: "We’re looking at this payment",
        body: `${what}. Something about it needs a person to check, for example the amount that arrived. We’ll email you. If you need us sooner, write to hello@gocast.fm.`,
      }
    default:
      return {
        tone: "off",
        lamp: "Waiting",
        title: "Waiting for your payment",
        body: `${what}. We haven’t seen the payment yet. If you’ve just sent it, keep this open; it updates by itself.`,
      }
  }
}
