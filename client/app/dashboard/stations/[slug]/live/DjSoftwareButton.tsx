"use client"

import { useEffect, useState } from "react"
import { IconLoader2, IconPlugConnected } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { HowToConnectLink } from "@/components/dashboard/EncoderConnection"
import type { Station, StationEncoder } from "@/interfaces/Station"
import type { StationStatus } from "@/interfaces/StationStatus"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { useStationPower } from "@/hooks/useStationPower"
import { useStationStatus } from "@/hooks/useStationStatus"
import { EncoderPanel } from "../settings/EncoderCard"

/**
 * "Using DJ software instead?" on the pre-flight page: the connection values
 * in a dialog right here, instead of a trip to Settings that left the
 * checks behind. The short panel: no watcher, New key or tips; Settings has
 * those for anyone who needs them.
 */
/** "Use DJ software instead", full width under Go live. */
export function DjSoftwareTrigger({ onClick }: { onClick: () => void }) {
  // A real button: it's the other way to go live, and a small grey link went
  // unnoticed. Outlined, so it never outshouts Go live.
  return (
    <Button size="lg" variant="ghost" full onClick={onClick}>
      <IconPlugConnected />
      Use DJ software instead
    </Button>
  )
}

/**
 * The dialog itself, rendered ONCE at the root of the page (not inside the
 * Go live view): a connection swaps the page under it to "You're already
 * live", and a dialog inside the swapped-out view would unmount and come
 * back, flashing and announcing the connection twice.
 */
export function DjSoftwareDialog({
  station,
  encoder,
  open,
  onOpenChange,
  onConnected,
}: {
  station: Station
  encoder: StationEncoder
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The software connected: the page swaps to its "You're already live" screen. */
  onConnected: (source: StationStatus["live_source"]) => void
}) {
  const [revealed, setRevealed] = useState(false)

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          // Hidden again next time, as on Settings: it's a password.
          if (!next) setRevealed(false)
        }}
      >
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Use your own DJ software</DialogTitle>
            <DialogDescription>
              <HowToConnectLink />
            </DialogDescription>
          </DialogHeader>
          <ConnectionNotice slug={station.slug} onConnected={onConnected} onDone={() => onOpenChange(false)} />
          <EncoderPanel
            stationName={station.name}
            encoder={encoder}
            password={encoder.password ?? null}
            revealed={revealed}
            onToggleReveal={() => setRevealed((r) => !r)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The station's side of the connection, on its own 2s poll while the dialog
 * is open:
 *   - off: software connects to the station itself, so with it off BUTT just
 *     retries "connecting" with no reason given; say so, with Start station
 *   - starting: give it a few seconds
 *   - connected: CONNECTED, the software's name and Done; a toast says it
 *     too, and the page under the dialog becomes "You're already live", so
 *     that's what's there when the dialog is closed. The dialog stays open:
 *     closing it on its own took the confirmation away before it was read.
 *   - on and waiting: WAITING with an indeterminate bar (the wait ends when
 *     someone presses Connect elsewhere, so there's no duration to show)
 */
function ConnectionNotice({
  slug,
  onConnected,
  onDone,
}: {
  slug: string
  onConnected: (source: StationStatus["live_source"]) => void
  onDone: () => void
}) {
  const { status } = useStationStatus(slug, true, 2000)
  // The dashboard's shared poll (band, sidebar): nudged on connect so they
  // say LIVE now, not at their own pace.
  const { refresh: refreshShared } = useStationStatus(slug)
  const power = useStationPower(slug)
  const source = status?.live_source ?? null
  const connected = status !== null && status.state !== "offline" && source?.type === "external"

  // Once per connection: `source` is a fresh object every poll.
  useEffect(() => {
    if (!connected) return
    void refreshShared()
    onConnected(source)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  if (!status) return null

  if (connected) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel bg-surface-inset px-4 py-3 text-body-sm">
        <StatusLamp tone="live" variant="solid" className="shrink-0">
          Connected
        </StatusLamp>
        <span className="min-w-0 flex-1 font-semibold">{source?.client ? `${source.client} is live.` : "Your software is live."}</span>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  const starting = status.state === "starting" || power.pending === "start"
  if (status.state !== "offline" && !starting) {
    return (
      <div role="status" className="flex flex-col gap-2.5 rounded-panel bg-surface-inset px-4 py-3 text-body-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusLamp tone="onair" variant="soft" pulse className="shrink-0">
            Waiting
          </StatusLamp>
          <span className="min-w-0 flex-1 text-muted-foreground">Detecting connection…</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-strong" role="progressbar" aria-label="Waiting for your software to connect">
          {/* Reduced motion: a still, dimmed full bar reads as waiting, not as a third done. */}
          <div className="h-full w-1/3 animate-indeterminate rounded-full bg-on-air motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-on-air/40" />
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-panel bg-fault-tint px-4 py-3 text-body-sm text-fault-text">
      <p className="min-w-0 flex-1">
        {starting ? (
          "Starting your station. Connect your software in a few seconds."
        ) : (
          <>
            <span className="font-semibold">Your station is off.</span> Start it first, then connect your software.
          </>
        )}
      </p>
      {!starting && (
        <Button size="sm" onClick={() => void power.start()} disabled={power.pending !== null}>
          Start station
        </Button>
      )}
      {starting && <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin" />}
    </div>
  )
}
