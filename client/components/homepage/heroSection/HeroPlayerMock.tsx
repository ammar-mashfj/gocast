import { IconPlayerPlay, IconBroadcast, IconUsers } from "@tabler/icons-react"
import styles from "./heroSection.module.css"

/** Cycled over the meter bars. Six animations with unrelated durations, so the
    row never resolves into a visible repeating pattern. */
const WAVE_CLASSES = [styles.wave1, styles.wave2, styles.wave3, styles.wave4, styles.wave5, styles.wave6]
/** Matches the segment count of the real OnAirDeck meter, so the bars stay
    chunky enough to read as levels rather than scattered dashes. */
const WAVE_BARS = 28

/**
 * Static mock of the listener player page, shown in the hero so visitors see
 * the tangible artifact they'll create — not just abstract brand motion.
 *
 * Dimensions and proportions intentionally track the real PlayerView so the
 * mock reads as "that's what my station page will look like" rather than an
 * illustration. Nothing is interactive; the vinyl uses the existing spin
 * animation for a touch of life without any network/audio dependency.
 */
export function HeroPlayerMock() {
  return (
    <div className="relative w-full max-w-[520px] md:ml-auto">
      {/* Ambient glow — kept at low opacity, composed with the hero's outer
          radial so the card sits on a soft halo rather than a hard rectangle. */}
      <div className="absolute inset-0 -z-1 translate-y-4 rounded-[28px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18),transparent_65%)] blur-2xl" aria-hidden="true" />

      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-md p-6 md:p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        {/* Top row: live badge + listener count */}
        <div className="flex items-center justify-between mb-5">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide text-emerald-300 uppercase">
            <span className={`w-1.5 h-1.5 bg-emerald-400 rounded-full ${styles.liveDot}`} />
            Live
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] text-text-muted">
            <IconUsers size={11} />
            <span>142 listening</span>
          </div>
        </div>

        {/* Vinyl + meta row */}
        <div className="flex items-center gap-5">
          <div className="relative size-[110px] shrink-0">
            {/* Outer disc */}
            <div className={`absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#1a1a24,#0f0f17,#1a1a24)] ${styles.vinylSpin}`}>
              {/* Grooves */}
              <div className="absolute inset-[6px] rounded-full border border-white/[0.04]" />
              <div className="absolute inset-[14px] rounded-full border border-white/[0.03]" />
              <div className="absolute inset-[22px] rounded-full border border-white/[0.025]" />
              {/* Label — tracks StudioMock's artwork gradient. The old
                  violet-to-pink ended when the headline gradient did; pink was
                  a third accent with no job in the violet/amber system. */}
              <div className="absolute inset-[28px] rounded-full bg-gradient-to-br from-[#7c3aed] to-[#2e1065] flex items-center justify-center">
                <div className="size-2 rounded-full bg-background" />
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] tracking-widest uppercase text-violet-muted mb-1.5">Now playing</div>
            <div className="text-lg font-semibold text-white leading-tight truncate">Midnight Jazz Hour</div>
            <div className="text-sm text-text-muted mt-0.5 truncate">hosted by Maya</div>
          </div>
        </div>

        {/* Controls row — static, but shaped like the real player */}
        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-white/[0.05]">
          <div className="size-11 rounded-full bg-violet-full flex items-center justify-center shadow-[0_4px_20px_rgba(139,92,246,0.4)] shrink-0">
            <IconPlayerPlay size={16} className="text-white fill-white translate-x-px" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-1.5">
              <span className="inline-flex items-center gap-1">
                <IconBroadcast size={11} className="text-emerald-400" />
                On air
              </span>
              <span className="tabular-nums">32:14</span>
            </div>
            {/* Not a progress bar. A live stream has no position, and the
                half-filled track that used to sit here quietly claimed the
                opposite — that this is a recorded file with an end, and that
                you are 50% of the way through it. A level meter is the only
                honest shape: it says "signal", which is the one thing a live
                mount can actually tell a listener. It also fixes the 32:14,
                which next to a half-filled track read as the track's duration
                rather than elapsed airtime. */}
            <div className="flex items-center gap-[2px] h-4" aria-hidden="true">
              {Array.from({ length: WAVE_BARS }).map((_, i) => (
                <span
                  key={i}
                  className={`flex-1 h-full origin-center rounded-[1px] bg-violet-muted/50 ${WAVE_CLASSES[i % WAVE_CLASSES.length]}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
