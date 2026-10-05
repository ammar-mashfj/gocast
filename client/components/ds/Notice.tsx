import { cn } from "@/lib/utils"
import { StatusLamp } from "./StatusLamp"

/**
 * Something the page needs you to know before you carry on: a check that
 * failed, a mic the browser blocked, another source already on air. Amber is
 * "listeners aren't hearing what you think" / "this didn't work"; `onair` is
 * a calm note about AutoDJ; `neutral` everything else. A lamp names it,
 * the sentence says what happened and what to do, buttons go underneath.
 */
const TONE = {
  warn: { box: "bg-fault-tint text-fault-text", lamp: "warn" },
  onair: { box: "bg-on-air-tint text-foreground", lamp: "onair" },
  neutral: { box: "bg-card text-foreground", lamp: "off" },
} as const

export function Notice({
  tone = "warn",
  label,
  title,
  children,
  actions,
  className,
}: {
  tone?: keyof typeof TONE
  /** Mono caps lamp word: "NOT LIVE", "MIC BLOCKED". */
  label?: string
  title?: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  const t = TONE[tone]
  return (
    <section role={tone === "warn" ? "alert" : undefined} className={cn("flex flex-col gap-3.5 rounded-panel p-4.5", t.box, className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3.5">
        {label && (
          <StatusLamp tone={t.lamp} variant={tone === "warn" ? "solid" : "soft"} className="shrink-0">
            {label}
          </StatusLamp>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          {title && <h2 className="text-body font-bold">{title}</h2>}
          {children && <div className="text-body leading-relaxed text-pretty">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </section>
  )
}
