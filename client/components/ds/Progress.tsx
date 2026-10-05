import { cn } from "@/lib/utils"

/**
 * Progress, two shapes:
 *
 *   SegmentBar  — "4 of 6 done": one segment per step, done ones green
 *   ProgressBar — a share of something: a track's position (violet for
 *                 AutoDJ), storage used (turns red when nearly full)
 */
export function SegmentBar({ done, total, className }: { done: number; total: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} of ${total} done`}
      className={cn("grid gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1.25 rounded-full", i < done ? "bg-ok" : "bg-surface-strong")} />
      ))}
    </div>
  )
}

export function ProgressBar({
  value,
  tone = "neutral",
  label,
  className,
}: {
  /** 0–1. */
  value: number
  tone?: "neutral" | "onair" | "live" | "warn"
  /** What the bar measures, for assistive tech. */
  label: string
  className?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-1 overflow-hidden rounded-full bg-foreground/8", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          { neutral: "bg-foreground", onair: "bg-on-air", live: "bg-live", warn: "bg-fault" }[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
