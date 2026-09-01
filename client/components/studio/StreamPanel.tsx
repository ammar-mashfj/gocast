"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconPlayerStopFilled,
  IconCopy,
  IconCheck,
  IconQrcode,
  IconCode,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { usePlan, useAutoDjLocked } from "@/contexts/AccountContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { QRCodeCanvas } from "qrcode.react"
import api from "@/lib/axios"
import type { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { formatBytes } from "@/lib/format"
import { AudioEngine } from "@/lib/audioEngine"
import { cn } from "@/lib/utils"
import type { BroadcastStats } from "@/hooks/useBroadcastStats"

const SHORTCUTS = [
  { action: "Push to talk", key: "Space", micOnly: true },
  { action: "Play / pause", key: "K" },
  { action: "Next track", key: "N" },
  { action: "Previous track", key: "P" },
  { action: "Cycle repeat (all/one)", key: "R" },
  { action: "Toggle monitor", key: "M" },
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
    <div className="flex items-end gap-[3px] h-8" aria-hidden>
      {bars.map((v, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[2px]",
            v === null ? "bg-muted" : v > 0 ? "bg-primary" : "bg-muted-foreground/20",
          )}
          style={{ height: v === null || v === 0 ? "3px" : `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

interface StreamPanelProps {
  stationId: string
  stats: BroadcastStats
  /** Bytes that actually reached the server this broadcast. */
  bytesSent: number
}

export function StreamPanel({ stationId, stats, bytesSent }: StreamPanelProps) {
  const router = useRouter()
  const { stop, micDisabled } = useBroadcast()
  const plan = usePlan()
  // No AutoDJ means there is nothing for the station to fall back to when the
  // broadcast ends — so ending it takes the station off air too, rather than
  // parking it on a silence bed until `stations:sweep` notices. On a plan with
  // AutoDJ, ending a broadcast is a HANDOVER: the rotation takes back over and
  // the station stays up. False while the plan is unknown, so an account we
  // can't identify keeps the safer behaviour of staying on air.
  const autoDjLocked = useAutoDjLocked()
  const [station, setStation] = useState<Station | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    api.get(`/stations/${stationId}`).then((res) => setStation(res.data.data))
  }, [stationId])

  const playerUrl = station ? `${env.appUrl}/station/${station.slug}` : ""

  // Null plan means "don't know" — never "free". Locking a paying customer out
  // of their own feature because one request timed out is the worse failure.
  const embedLocked = plan !== null && plan.slug === "free"

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])

  async function handleCopy() {
    if (!playerUrl) return
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
    <div className="border-l p-5 flex flex-col gap-5 overflow-y-auto h-full w-full">
      {/* Listeners */}
      <div className="flex flex-col gap-3">
        <div className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Listeners
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {stats.listeners === null ? "—" : stats.listeners.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">tuned in right now</span>
        </div>
        <Sparkline history={stats.history} peak={stats.peak} />
        {stats.peak === 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Nobody has joined yet. Share your player link — a stream with no
            listeners still counts toward your uptime.
          </p>
        )}
      </div>

      {/* Player link */}
      <div className="flex flex-col gap-2.5">
        <div className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Player link
        </div>
        {playerUrl ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pl-3 pr-1.5">
              <span className="flex-1 min-w-0 text-xs text-primary truncate">{playerUrl}</span>
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? (
                  <IconCheck data-icon="inline-start" />
                ) : (
                  <IconCopy data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() =>
                  toast.info("Embeddable player is coming to Pro", {
                    description: "Share the player link in the meantime.",
                  })
                }
              >
                <IconCode data-icon="inline-start" />
                Embed
                {embedLocked && (
                  <Badge variant="secondary" className="ml-1.5 text-[9px]">PRO</Badge>
                )}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <IconQrcode data-icon="inline-start" />
                    QR code
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xs">
                  <DialogHeader>
                    <DialogTitle>Tune in</DialogTitle>
                    <DialogDescription>
                      Point a phone camera at this to open {station?.name ?? "the station"}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-center rounded-lg bg-white p-4">
                    <QRCodeCanvas value={playerUrl} size={180} />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        )}
      </div>

      {/* This broadcast */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] tracking-widest uppercase text-muted-foreground">
          This broadcast
        </div>
        <div className="flex flex-col">
          {[
            { k: "Started", v: startedLabel },
            { k: "Bitrate", v: `${AudioEngine.encoderInfo().bitrate} kbps` },
            { k: "Data sent", v: formatBytes(bytesSent) },
            { k: "Peak listeners", v: stats.peak.toLocaleString() },
          ].map((s) => (
            <div
              key={s.k}
              className="flex items-center justify-between gap-2.5 py-1.5 border-b text-sm"
            >
              <span className="text-muted-foreground">{s.k}</span>
              <span className="text-xs tabular-nums">{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Shortcuts */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] tracking-widest uppercase text-muted-foreground">
          Shortcuts
        </div>
        {SHORTCUTS.filter((s) => !s.micOnly || !micDisabled).map((s) => (
          <div key={s.action} className="flex items-center justify-between gap-2.5 text-xs">
            <span className="text-muted-foreground">{s.action}</span>
            <Badge variant="secondary" className="text-[10px]">{s.key}</Badge>
          </div>
        ))}
      </div>

      {/* End broadcast */}
      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {confirmEnd && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs text-destructive leading-relaxed">
              Ending stops the stream for everyone tuned in. Your queue is kept.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={ending}
                onClick={async () => {
                  setEnding(true)
                  try {
                    await stop({ releaseStation: autoDjLocked })
                    router.push(`/dashboard/stations/${stationId}`)
                    // The station page is server-rendered from desired_state,
                    // and the studio redirects there the moment the socket
                    // closes — ahead of the stop above. Without this it shows
                    // "On air" until its next status poll.
                    router.refresh()
                  } finally {
                    setEnding(false)
                  }
                }}
              >
                {ending ? "Ending…" : "Yes, end it"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmEnd(false)}
              >
                Keep going
              </Button>
            </div>
          </div>
        )}
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmEnd(true)}
          disabled={confirmEnd}
        >
          <IconPlayerStopFilled data-icon="inline-start" />
          End broadcast
        </Button>
      </div>
    </div>
  )
}
