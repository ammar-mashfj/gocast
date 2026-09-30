"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconArrowRight, IconLockOpen } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { SIGNAL_TONE, useStudioSignal, useTransportHealth } from "@/components/studio/signal"
import { useCoarsePointer } from "@/lib/useCoarsePointer"
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
  const touch = useCoarsePointer()

  if (!isLive || !stationSlug || onStudio || !signal) return null

  const tone = SIGNAL_TONE[signal.tone]
  const latched = engine?.isMicLatched() ?? false

  return (
    // Below sm the chip and the buttons share the first line and the message
    // takes the whole second one; beside the chip and "Open studio" it was a
    // five-line sliver on a phone.
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5", tone.strip)}>
      <p key={signal.code} className="sr-only" role={signal.tone === "fault" ? "alert" : "status"}>
        {signal.label}. {signal.detail}
      </p>
      <span
        key={`chip-${signal.code}`}
        aria-hidden
        className={cn(
          "lamp-settle inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold uppercase tracking-[0.08em]",
          tone.chip,
        )}
      >
        <span className={cn("size-1.5 rounded-full bg-current", signal.tone !== "fault" && "animate-pulse motion-reduce:animate-none")} />
        {signal.label}
      </span>
      <span aria-hidden className={cn("order-last basis-full text-sm leading-snug sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0", tone.text)}>
        {signal.code === "live"
          ? touch
            ? "You're broadcasting from this tab — switching apps or locking the screen stops the show."
            : "You're broadcasting from this tab — closing it ends the show."
          : signal.detail}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
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
