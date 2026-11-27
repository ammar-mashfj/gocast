"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { IconSparkles, IconTag, IconInfoCircle } from "@tabler/icons-react"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import { useBroadcastOptional } from "@/contexts/BroadcastContext"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { useAccount } from "@/contexts/AccountContext"
import { isLavaLink, withLavaAccount } from "@/lib/billing"
import { canAutoOpen, endsLabel, isInternalLink, KIND_LABEL, pickAutoOpen } from "@/lib/spotlight"
import type { Spotlight, SpotlightAction } from "@/interfaces/Spotlight"
import { Button } from "@/components/ds/Button"
import { Tag } from "@/components/ds/Tag"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"

const KIND_ICON = { offer: IconTag, feature: IconSparkles, notice: IconInfoCircle } as const

/** The checkout link params ProCheckoutProvider reads on a full page load. */
const CHECKOUT_PARAMS = ["coupon", "product", "checkout"]

/**
 * Spotlights: the dialog a matching account gets when it opens the dashboard
 * (an offer, a new feature, a notice), and the chip in the top bar that
 * brings a minimised one back. Written in /admin/spotlights.
 *
 * One way out. However it is closed (the ×, "Later", Escape, a click
 * outside), the dialog goes and a chip stays in the top bar until the
 * spotlight ends or the account leaves its audience. A reload brings back
 * the chip, not the dialog. There is deliberately no "close for good":
 * people shut dialogs by reflex, and that reflex should not cost them the
 * offer with no way back to it.
 *
 * At most one opens by itself per page load, the highest priority; any
 * others wait as chips. It never opens over the studio or while a show is on
 * air (lib/spotlight canAutoOpen) and waits for the next calm page instead.
 *
 * Fetched once per load, not polled: a spotlight is not urgent, and the next
 * visit is soon enough.
 */
export function Spotlights() {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const broadcast = useBroadcastOptional()
  const checkout = useProCheckout()
  const account = useAccount()
  const [items, setItems] = useState<Spotlight[] | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Whether this load has had its one automatic dialog.
  const [autoOpened, setAutoOpened] = useState(false)

  useEffect(() => {
    let stale = false
    api
      .get<{ data: Spotlight[] }>("/spotlights")
      .then((res) => {
        if (!stale) setItems(res.data.data)
      })
      .catch(() => {
        // Nothing to show is the right failure; the next load asks again.
      })
    return () => {
      stale = true
    }
  }, [])

  // The one automatic dialog of this load, picked during render (React's
  // "adjust state while rendering" pattern) rather than in an effect, so it
  // opens on the same frame the list arrives or the host leaves the studio.
  if (items && !autoOpened && canAutoOpen(pathname, broadcast?.state ?? null)) {
    const next = pickAutoOpen(items)
    if (next) {
      setAutoOpened(true)
      setOpenKey(next.key)
    }
  }

  // Every time a dialog opens, automatically or from its chip.
  useEffect(() => {
    if (openKey) record(openKey, "seen")
  }, [openKey])

  if (!items || items.length === 0) return null

  const current = items.find((s) => s.key === openKey) ?? null

  function minimize(spotlight: Spotlight) {
    setOpenKey(null)
    if (spotlight.state !== "minimized") {
      setItems((list) => list?.map((s) => (s.key === spotlight.key ? { ...s, state: "minimized" } : s)) ?? list)
      record(spotlight.key, "minimize")
    }
  }

  function reopen(spotlight: Spotlight) {
    setOpenKey(spotlight.key)
  }

  function follow(spotlight: Spotlight) {
    const url = spotlight.cta_url
    if (!url) return
    record(spotlight.key, "click")
    // Kept as a chip: following the link is not finishing with it (checkout
    // can be abandoned), and buying Pro drops an offer on its own.
    minimize(spotlight)

    if (!isInternalLink(url)) {
      // A lava.top link carries the account id, as the checkout dialog's do,
      // so the payment webhook finds this account whatever email is typed.
      const href = isLavaLink(url) ? withLavaAccount(url, account?.id ?? null, { medium: "spotlight", campaign: spotlight.key }) : url
      // In the click itself, so no popup blocker stops it; never this tab,
      // which would end a live show.
      window.open(href, "_blank", "noopener,noreferrer")
      return
    }
    // A checkout link opens the dialog directly. ProCheckoutProvider reads
    // these params once, on a full page load, so navigating to them inside
    // the app would land on the page with no checkout.
    const target = new URL(url, window.location.origin)
    if (CHECKOUT_PARAMS.some((p) => target.searchParams.has(p))) {
      checkout.open({
        coupon: target.searchParams.get("coupon") ?? undefined,
        product: target.searchParams.get("product") ?? undefined,
      })
      return
    }
    router.push(url)
  }

  // Everything not currently open waits as a chip: the minimised ones, and
  // any new one that lost to a higher priority this visit.
  const chips = items.filter((s) => s.key !== openKey && (s.state === "minimized" || autoOpened))

  return (
    <>
      {chips.map((spotlight) => (
        <SpotlightChip key={spotlight.key} spotlight={spotlight} onOpen={() => reopen(spotlight)} />
      ))}

      <Dialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open && current) minimize(current)
        }}
      >
        {current && (
          <DialogContent size="md" aria-describedby={undefined}>
            <SpotlightBody spotlight={current} onMinimize={() => minimize(current)} onFollow={() => follow(current)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function record(key: string, action: SpotlightAction) {
  api.post(`/spotlights/${encodeURIComponent(key)}/${action}`).catch(() => {
    // Losing one of these costs a dialog that opens once more; not worth a toast.
  })
}

function SpotlightChip({ spotlight, onOpen }: { spotlight: Spotlight; onOpen: () => void }) {
  const Icon = KIND_ICON[spotlight.kind]
  const ends = endsLabel(spotlight.ends_at)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${KIND_LABEL[spotlight.kind]}: ${spotlight.title}${ends ? `. ${ends}` : ""}`}
      className={cn(
        "inline-flex h-9 max-w-64 items-center gap-2 rounded-item px-3 text-body-sm font-semibold transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        spotlight.kind === "offer" ? "bg-fault-tint text-fault-text hover:bg-fault/25" : "bg-card text-foreground hover:bg-surface-control",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="hidden truncate md:inline">{spotlight.chip_label}</span>
    </button>
  )
}

function SpotlightBody({
  spotlight,
  onMinimize,
  onFollow,
}: {
  spotlight: Spotlight
  onMinimize: () => void
  onFollow: () => void
}) {
  const Icon = KIND_ICON[spotlight.kind]
  const ends = endsLabel(spotlight.ends_at)

  return (
    <>
      {spotlight.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied URL on any host; next/image would need every host allow-listed.
        <img src={spotlight.image_url} alt="" className="-mx-5 aspect-2/1 w-auto max-w-none object-cover sm:-mx-6.5 sm:-mt-6.5 sm:rounded-t-hero" />
      )}

      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Tag variant={spotlight.kind === "offer" ? "warn" : "neutral"}>
            <Icon aria-hidden className="size-3.5" />
            {KIND_LABEL[spotlight.kind]}
          </Tag>
          {ends && <span className="text-caption font-semibold text-muted-foreground">{ends}</span>}
          {spotlight.preview && <Tag variant="neutral">Preview, only the test list sees this</Tag>}
        </div>
        <DialogTitle>{spotlight.title}</DialogTitle>
      </DialogHeader>

      {spotlight.body_html && (
        <DialogDescription asChild>
          <div
            className={cn(
              "flex flex-col gap-2.5",
              "[&_strong]:font-semibold [&_strong]:text-foreground",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1",
            )}
            dangerouslySetInnerHTML={{ __html: spotlight.body_html }}
          />
        </DialogDescription>
      )}

      <DialogFooter>
        <Button variant="subtle" size="lg" onClick={onMinimize}>
          Later
        </Button>
        {spotlight.cta_url && spotlight.cta_label && (
          <Button variant={spotlight.kind === "offer" ? "pro" : "primary"} size="lg" onClick={onFollow}>
            {spotlight.cta_label}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
