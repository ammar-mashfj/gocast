"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconArrowRight, IconLockOpen } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { SIGNAL_TONE, useStudioSignal, useTransportHealth } from "@/components/studio/signal"
import { cn } from "@/lib/utils"

/**
 * The studio's lamp, carried onto every other dashboard page while a
 * broadcast is running.
 *
 * The broadcast runs in this tab — mic, mixer and encoder all live in the
 * page — so leaving the studio does not leave the show. This strip used to
 * say only "You're live" in green, which hid the one state that matters most
 * away from the studio: a mic latched open while the broadcaster reads
 * their settings page out loud to every listener. It now shows exactly what
 * the studio lamp shows, and offers Unlatch right where the problem is.
 *
 * Not rendered in the studio, which draws the full lamp itself.
 */
export function LiveBanner() {
  const pathname = usePathname()
  const { state, stationSlug, engine } = useBroadcast()
  const isLive = state === "live" || state === "reconnecting"
  const onStudio = !!stationSlug && (pathname?.startsWith(`/dashboard/stations/${stationSlug}/studio`) ?? false)
  const transport = useTransportHealth(isLive && !onStudio)
  const signal = useStudioSignal(transport, { inStudio: false })

  if (!isLive || !stationSlug || onStudio || !signal) return null

  const tone = SIGNAL_TONE[signal.tone]
  const latched = engine?.isMicLatched() ?? false

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5", tone.strip)}>
      <p key={signal.code} className="sr-only" role={signal.tone === "fault" ? "alert" : "status"}>
        {signal.label}. {signal.detail}
      </p>
      <div className="flex min-w-0 flex-1 items-center gap-3" aria-hidden>
        <span
          key={signal.code}
          className={cn(
            "lamp-settle inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold uppercase tracking-[0.08em]",
            tone.chip,
          )}
        >
          <span className={cn("size-1.5 rounded-full bg-current", signal.tone !== "fault" && "animate-pulse motion-reduce:animate-none")} />
          {signal.label}
        </span>
        <span className={cn("min-w-0 text-sm leading-snug", tone.text)}>
          {signal.code === "live"
            ? "You're broadcasting from this tab — closing it ends the show."
            : signal.detail}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {latched && (
          <button
            type="button"
            onClick={() => engine?.setMicLatched(false)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-mic px-3 text-sm font-semibold text-[#04121c] transition-[filter] hover:brightness-110"
          >
            <IconLockOpen size={15} />
            Mic off
          </button>
        )}
        <Link
          href={`/dashboard/stations/${stationSlug}/studio`}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-foreground no-underline transition-colors hover:bg-white/[0.06]"
        >
          Open studio
          <IconArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}
