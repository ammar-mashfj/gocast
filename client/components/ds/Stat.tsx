import { cn } from "@/lib/utils"

/**
 * A number with its label, two ways:
 *
 *   Stat     — bare, inside a card: mono caps label, 800 30px value, a line
 *              under it ("about 1h 28m each"). `trend` colours that line:
 *              up is green, down is muted — never red, which means live.
 *   StatTile — the design system's StatTile: the same on its own card tile.
 *              `good` turns the value green ("Audio lost: 0 s").
 */
export interface StatProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  trend?: "up" | "flat"
  className?: string
}

export function Stat({ label, value, sub, trend, className }: StatProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="eyebrow text-text-faint">{label}</span>
      <span className="font-display text-title-lg tabular-nums">{value}</span>
      {sub && <span className={cn("text-caption", trend === "up" ? "text-ok" : "text-muted-foreground")}>{sub}</span>}
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  good,
  compact,
  className,
}: Omit<StatProps, "trend"> & {
  good?: boolean
  /** A smaller value on phones, for a row of three where a clock has to fit. */
  compact?: boolean
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-well bg-card p-3.5", className)}>
      <span className="eyebrow font-medium text-text-faint">{label}</span>
      <span className={cn("font-display font-bold tabular-nums", compact ? "text-meter-sm sm:text-meter" : "text-meter", good && "text-ok")}>{value}</span>
      {sub && <span className="text-caption text-text-faint">{sub}</span>}
    </div>
  )
}
