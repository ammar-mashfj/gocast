"use client"

import { IconAntenna, IconHeadphones, IconWorld } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { airClock, demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The FM hero: a simulcast monitor, acted out over a 30 s loop. The encoder
 * is connected and the online stream carries the FM programme; then the
 * encoder drops and AutoDJ takes over (the station's fallback is live >
 * AutoDJ > silence, station.blade.php); then the encoder is back and FM is
 * on air online again. This is the backup the page sells, so it is shown,
 * not just claimed. No play button: a labelled preview. 98.4 Coastline FM is
 * made up.
 */

const LOOP_S = 30
const DROP_AT = 18
const BACK_AT = 25

export function SimulcastMonitorDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const q = secs % LOOP_S
  const dropped = q >= DROP_AT && q < BACK_AT
  const uptime = dropped ? 0 : q >= BACK_AT ? q - BACK_AT : 4 * 86400 + 7 * 3600 + 12 * 60 + q

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · your simulcast, with a backup</span>
      <div ref={ref} className="flex flex-col gap-3 rounded-card bg-card p-5">
        <div className="flex items-center justify-between gap-3 pb-1">
          <span className="truncate font-display text-heading">98.4 Coastline FM</span>
          <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
            <IconHeadphones size={16} />
            <span className="text-foreground">{demoListeners(486, secs, 4)}</span> online
          </span>
        </div>

        <Row icon={<IconAntenna size={18} />} label="FM transmitter" value="Morning Show with Dee" lamp={<StatusLamp tone="live" size="sm">On air</StatusLamp>} />

        <div
          className={cn(
            "flex flex-col gap-1.5 rounded-item p-3.5 transition-colors duration-300",
            dropped ? "bg-fault-tint" : "bg-surface-raised",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow-sm text-text-faint">Encoder → GoCast</span>
            {dropped ? (
              <span className="eyebrow-sm inline-flex items-center gap-2 text-fault-text">
                <span className="size-2 rounded-full bg-fault" /> Disconnected
              </span>
            ) : (
              <span className="eyebrow-sm inline-flex items-center gap-2 text-ok">
                <span className="size-2 rounded-full bg-ok" /> Connected
              </span>
            )}
          </div>
          <span className="font-mono text-caption tabular-nums text-muted-foreground">
            {dropped ? "Reconnecting…" : `Up ${uptime >= 86400 ? `${Math.floor(uptime / 86400)}d ` : ""}${airClock(0, uptime % 86400)}`}
          </span>
        </div>

        <div key={dropped ? "b" : "fm"} className="min-w-0 animate-in fade-in duration-500">
          <Row
            icon={<IconWorld size={18} />}
            label="Online listeners hear"
            value={dropped ? "Backup: Coastline Classics" : "Morning Show with Dee"}
            lamp={
              dropped ? (
                <StatusLamp tone="onair" size="sm">AutoDJ</StatusLamp>
              ) : (
                <StatusLamp tone="live" size="sm" pulse>From FM</StatusLamp>
              )
            }
          />
        </div>
      </div>
    </div>
  )
}

function Row({ icon, label, value, lamp }: { icon: React.ReactNode; label: string; value: string; lamp: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-item bg-surface-raised p-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-item bg-background text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="eyebrow-sm text-text-faint">{label}</span>
        <span className="text-body-sm font-semibold text-pretty">{value}</span>
      </div>
      {lamp}
    </div>
  )
}
