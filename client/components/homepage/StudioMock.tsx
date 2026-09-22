import { IconMicrophoneFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled, IconUsers } from "@tabler/icons-react"
import styles from "./heroSection/heroSection.module.css"

/** Matches MIC_METER_SEGMENTS in the real OnAirDeck. */
const METER_SEGMENTS = 28
/** Lit segments — a talking voice, not a peak. */
const METER_LIT = 11

/** The row the real studio prints under the deck, minus the ones that need
    a monitor device to make sense. */
const SHORTCUTS = [
  { key: "Space", action: "talk" },
  { key: "K", action: "play / pause" },
  { key: "N", action: "next" },
  { key: "P", action: "previous" },
  { key: "R", action: "repeat" },
]

/**
 * Static mock of the on-air deck, deliberately frozen in the ducked state —
 * mic open, music pulled down underneath it. That single moment is the thing
 * the section claims and the thing a card full of words cannot demonstrate:
 * the progress bar dims, the status line changes, the meter moves.
 *
 * Proportions, copy and colours track the real OnAirDeck (the sky-300 duck
 * notice, the 28-segment meter, the "Release Space to stop" label) so this
 * reads as a screenshot rather than an illustration. Nothing is interactive.
 */
export function StudioMock() {
  return (
    <div className="relative w-full max-w-[540px] mx-auto">
      <div
        className="absolute inset-0 -z-1 translate-y-4 rounded-[28px] bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.14),transparent_65%)] blur-2xl"
        aria-hidden="true"
      />

      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-md p-5 md:p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        {/* Status bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-[0.2em] text-emerald-300 uppercase">
            <span className={`w-1.5 h-1.5 bg-emerald-400 rounded-full ${styles.liveDot}`} />
            On air
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-muted tabular-nums">
            <span>32:14</span>
            <span className="inline-flex items-center gap-1">
              <IconUsers size={11} />
              142
            </span>
          </div>
        </div>

        {/* Track on air — dimmed, because the mic is open over it */}
        <div className="flex items-center gap-4">
          <div className="size-14 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#2e1065] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <span className="text-base font-semibold text-white truncate">Night Bus</span>
              <span className="text-sm text-text-muted italic truncate">The Ember Set</span>
            </div>
            {/* opacity-35 is what the real ProgressRow does while ducked */}
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-2 opacity-35">
              <div className="h-full w-[38%] bg-white/40" />
            </div>
            <div className="text-xs text-sky-300 mt-2">Music ducked under your mic</div>
          </div>
        </div>

        {/* Mic meter + transport */}
        <div className="flex items-center gap-3 mt-5 pt-5 border-t border-white/[0.05]">
          <div className="inline-flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-2 shrink-0">
            <IconMicrophoneFilled size={14} className="text-sky-300" />
            <span className="text-[11px] text-sky-200 whitespace-nowrap">Release Space to stop</span>
          </div>

          <div className="flex-1 flex items-center gap-[2px] min-w-0" aria-hidden="true">
            {Array.from({ length: METER_SEGMENTS }).map((_, i) => (
              <span
                key={i}
                className={`h-4 flex-1 rounded-[1px] ${
                  i < METER_LIT
                    ? i > METER_SEGMENTS - 8
                      ? "bg-amber-400/80"
                      : "bg-sky-400/80"
                    : "bg-white/[0.06]"
                }`}
              />
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-text-faint">
            <span className="size-7 rounded-md border border-white/[0.08] flex items-center justify-center">
              <IconPlayerSkipBackFilled size={11} />
            </span>
            <span className="size-7 rounded-md border border-white/[0.08] flex items-center justify-center">
              <IconPlayerSkipForwardFilled size={11} />
            </span>
          </div>
        </div>

        {/* Shortcut row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5 pt-4 border-t border-white/[0.05]">
          {SHORTCUTS.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
              <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                {s.key}
              </kbd>
              {s.action}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
