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
  /** A short code shown before the label in mono, e.g. a country's "GB". */
  code?: string
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
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="font-display text-heading">{title}</h2>

      {items.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((item) => {
            const share = total > 0 ? Math.round((item.value / total) * 100) : 0

            return (
              <li key={item.key} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {item.code && <span className="shrink-0 rounded-swatch bg-surface-control px-1.25 py-0.75 eyebrow-sm text-muted-foreground">{item.code}</span>}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                    {item.detail ? `${item.detail} · ` : ""}
                    {share}%
                  </span>
                </div>
                {/* A lit white bar on an unlit track, like a meter held at
                    level. Neutral on purpose: no hue here names a state
                    (DESIGN.md, the One Meaning Rule). */}
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-control">
                  <div
                    className="h-full rounded-full bg-muted-foreground"
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                </div>
              </li>
            )
          })}
          {remainder > 0 && (
            <li className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
              <span className="truncate">{remainderLabel}</span>
              <span className="shrink-0 font-mono text-caption tabular-nums">
                {Math.round((remainder / total) * 100)}%
              </span>
            </li>
          )}
        </ul>
      )}

      {footnote && items.length > 0 && (
        <p className="text-body-sm leading-relaxed text-text-faint">{footnote}</p>
      )}
    </div>
  )
}
