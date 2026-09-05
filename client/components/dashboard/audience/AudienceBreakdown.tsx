import { cn } from "@/lib/utils"

/**
 * One dimension of the audience as a share-of-known list — countries, devices,
 * browsers, referrers.
 *
 * SHARE OF WHAT IS KNOWN, not of everything. Rows the API could not classify
 * are absent from the data entirely (see AudienceReport::breakdown), so the
 * percentages here are of the listens that COULD be classified rather than of
 * the window's total sessions. The alternative — an "Unknown" bucket — is
 * frequently the largest entry and tells a broadcaster nothing they can act
 * on. `footnote` is where a caller states that denominator out loud.
 */
export interface BreakdownItem {
  key: string
  label: string
  value: number
  /** Optional second figure shown to the right, e.g. listening time. */
  detail?: string
}

interface AudienceBreakdownProps {
  title: string
  items: BreakdownItem[]
  /**
   * Every listen this dimension could classify — supplied by the API, NOT
   * summed from `items`, which is a truncated list. Shares against the visible
   * rows would report a country as 40% of an audience it was 12% of.
   */
  total: number
  /** Shown in place of the list when there is nothing to draw. */
  empty: string
  /** What to call the truncated tail. "Other" suits most dimensions. */
  remainderLabel?: string
  footnote?: string
}

export function AudienceBreakdown({
  title,
  items,
  total,
  empty,
  remainderLabel = "Other",
  footnote,
}: AudienceBreakdownProps) {
  const shown = items.reduce((sum, item) => sum + item.value, 0)
  // The tail exists whenever the list was cut short. Naming it keeps the bars
  // from having to add up to 100% to look honest.
  const remainder = Math.max(0, total - shown)

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <h3 className="text-sm font-medium">{title}</h3>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {items.map((item) => {
            const share = total > 0 ? Math.round((item.value / total) * 100) : 0

            return (
              <li key={item.key} className="flex flex-col gap-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.detail ? `${item.detail} · ` : ""}
                    {share}%
                  </span>
                </div>
                {/* The bar is the same single hue as the chart above it: one
                    series per figure, so colour never has to carry identity
                    and no palette can be misread as a category. */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full bg-primary/70")}
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                </div>
              </li>
            )
          })}
          {remainder > 0 && (
            <li className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">{remainderLabel}</span>
              <span className="shrink-0 tabular-nums">
                {Math.round((remainder / total) * 100)}%
              </span>
            </li>
          )}
        </ul>
      )}

      {footnote && items.length > 0 && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">{footnote}</p>
      )}
    </div>
  )
}
