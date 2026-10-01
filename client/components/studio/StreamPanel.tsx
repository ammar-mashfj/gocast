"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  IconCopy,
  IconCheck,
  IconQrcode,
  IconCode,
  IconPlus,
  IconHelpCircle,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEmbedLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { EmbedDialog } from "@/components/dashboard/EmbedDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { QRCodeCanvas } from "qrcode.react"
import { env } from "@/lib/env"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { BroadcastStats } from "@/hooks/useBroadcastStats"

const SHORTCUTS = [
  { action: "Push to talk (hold)", key: "Space", micOnly: true },
  { action: "Keep mic on / mic off", key: "L", micOnly: true },
  { action: "Play / pause", key: "K" },
  { action: "Next track", key: "N" },
  { action: "Previous track", key: "P" },
  { action: "Repeat list / repeat track", key: "R" },
  { action: "Speaker monitor", key: "M" },
]

/**
 * Listener sparkline over the current broadcast.
 *
 * Scaled to the session peak rather than a fixed ceiling — a show that tops
 * out at four listeners should still show its shape, and the number beside it
 * carries the magnitude.
 */
function Sparkline({ history, peak }: { history: number[]; peak: number }) {
  const max = Math.max(1, peak)
  const bars = Array.from({ length: 24 }, (_, i) => history[history.length - 24 + i] ?? null)

  return (
    <div className="flex items-end gap-[3px] h-10" aria-hidden>
      {bars.map((v, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[2px]",
            v === null ? "bg-foreground/5" : v > 0 ? "bg-foreground/70" : "bg-foreground/15",
          )}
          style={{ height: v === null || v === 0 ? "3px" : `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

interface StreamPanelProps {
  slug: string
  /** From the studio's station context; the slug until that has loaded. */
  stationName: string
  stats: BroadcastStats
  /** Bytes that actually reached the server this broadcast. */
  bytesSent: number
}

export function StreamPanel({ slug, stationName, stats, bytesSent }: StreamPanelProps) {
  const { micDisabled } = useBroadcast()
  const [copied, setCopied] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)

  // Everything here needs only the slug and name, which the studio already
  // holds. This used to re-fetch the station on every studio mount — and on
  // phones, where the rail is never shown — leaving the link, QR code and
  // embed as skeletons until it came back.
  const playerUrl = `${env.appUrl}/station/${slug}`

  // Free gets the badge and the upgrade dialog, never the snippet. An unknown
  // plan renders unlocked — see useEmbedLocked — and the embed page is what
  // actually refuses.
  const embedLocked = useEmbedLocked()
  const proRequest = useProRequest()

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(playerUrl)
      setCopied(true)
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually")
    }
  }

  const startedLabel = stats.startedAt
    ? new Date(stats.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—"

  return (
    // A column of cards on the page, like the console beside it (it used to
    // be a darker strip of its own).
    <aside aria-label="This broadcast" className="flex h-full w-full flex-col gap-2.5 overflow-y-auto">
      {/* Listeners */}
      <section aria-labelledby="rail-listeners" className="flex flex-col gap-3 rounded-3xl bg-card p-4">
        <h2 id="rail-listeners" className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-faint">Listening now</h2>
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-5xl font-extrabold leading-none tracking-[-0.03em] tabular-nums">
            {stats.listeners === null ? "—" : stats.listeners.toLocaleString()}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            peak <span className="text-foreground tabular-nums">{stats.peak.toLocaleString()}</span>
          </span>
        </div>
        <Sparkline history={stats.history} peak={stats.peak} />
        <p className="sr-only">
          Listener count over the last few minutes, peaking at {stats.peak} this broadcast.
        </p>
        {stats.peak === 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nobody has joined yet. Share your player link below — it opens straight
            into your show, no app or account needed.
          </p>
        )}
      </section>

      {/* Player link */}
      <section aria-labelledby="rail-link" className="flex flex-col gap-2.5 rounded-3xl bg-card p-4">
        <h2 id="rail-link" className="text-sm font-bold">Your link</h2>
        <div className="flex items-center gap-2 rounded-xl bg-background py-1.5 pl-3 pr-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {playerUrl.replace(/^https?:\/\//, "")}
          </span>
          <Button variant="secondary" size="sm" className="h-8" onClick={handleCopy}>
            {copied ? (
              <IconCheck data-icon="inline-start" />
            ) : (
              <IconCopy data-icon="inline-start" />
            )}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 flex-1"
            onClick={() => (embedLocked ? proRequest.open() : setShowEmbed(true))}
          >
            <IconCode data-icon="inline-start" />
            Embed
            {embedLocked && (
              <Badge variant="pro" className="ml-1">
                Pro
              </Badge>
            )}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 flex-1">
                <IconQrcode data-icon="inline-start" />
                QR code
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Tune in</DialogTitle>
                <DialogDescription>
                  Point a phone camera at this to open {stationName}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-lg bg-white p-4">
                <QRCodeCanvas value={playerUrl} size={180} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <EmbedDialog
          open={showEmbed}
          onOpenChange={setShowEmbed}
          slug={slug}
          stationName={stationName}
        />
      </section>

      {/* This broadcast */}
      <section aria-labelledby="rail-show" className="flex flex-col gap-1 rounded-3xl bg-card p-4">
        <h2 id="rail-show" className="mb-1 text-sm font-bold">This broadcast</h2>
        <dl className="flex flex-col">
          {[
            { k: "Started", v: startedLabel },
            { k: "Data sent", v: formatBytes(bytesSent) },
          ].map((row) => (
            <div
              key={row.k}
              className="flex items-center justify-between gap-2.5 border-b border-border py-2 text-sm last:border-b-0"
            >
              <dt className="text-muted-foreground">{row.k}</dt>
              <dd className="font-mono text-xs tabular-nums">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Shortcuts: always one key away, but not always on screen. */}
      <details className="group rounded-3xl bg-card px-4 py-2.5 text-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-muted-foreground marker:hidden hover:text-foreground">
          Keyboard shortcuts
          <IconPlus size={13} className="shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
        </summary>
        <dl className="mt-2 flex flex-col gap-1.5 pb-1">
          {SHORTCUTS.filter((sc) => !sc.micOnly || !micDisabled).map((sc) => (
            <div key={sc.action} className="flex items-center justify-between gap-2.5">
              <dt className="text-muted-foreground">{sc.action}</dt>
              <dd>
                <kbd className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {sc.key}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </details>

      {/* The studio had no way into its own help article; a live host who is
          stuck mid-show is the reader it was written for. HelpLink always
          opens a new tab, so this can't end the broadcast. */}
      <a
        href="/help/using-the-studio"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 text-xs text-muted-foreground no-underline hover:text-foreground"
      >
        <IconHelpCircle size={14} aria-hidden />
        How the studio works
      </a>

    </aside>
  )
}
