import { IconPlayerPlay, IconBroadcast, IconUsers } from "@tabler/icons-react"
import styles from "./heroSection.module.css"

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
    <div className="relative w-full max-w-[460px] mx-auto">
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
              {/* Label */}
              <div className="absolute inset-[28px] rounded-full bg-gradient-to-br from-violet-full to-pink-500 flex items-center justify-center">
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
              <span>32:14</span>
            </div>
            {/* Faux progress / signal bar */}
            <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full w-1/2 bg-gradient-to-r from-violet-full to-pink-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
