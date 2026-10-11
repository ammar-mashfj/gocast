import { cn } from "@/lib/utils"

/**
 * One homepage section: a full-bleed band (optionally the card colour, so
 * the studio and pricing read as rooms of their own) with its content
 * capped at the page measure. The vertical rhythm is the same everywhere
 * — 56px on phones up to 112px on desktop — so the page scrolls evenly.
 */
export function Section({
  id,
  tone = "ground",
  className,
  children,
}: {
  id?: string
  /** `card` fills the band with the card colour; `ground` leaves the page colour. */
  tone?: "ground" | "card"
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-17", tone === "card" ? "bg-card" : "border-t border-line", className)}
    >
      <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-gutter py-14 sm:gap-12 sm:py-20 lg:gap-14 lg:py-28">
        {children}
      </div>
    </section>
  )
}

/**
 * A section's opening: a mono eyebrow (with the plan tag beside it where the
 * section belongs to a plan), the heading, and a lead line. `split` puts the
 * lead in a second column, aligned to the heading's baseline, for the two
 * sections whose lead is long.
 */
export function SectionIntro({
  eyebrow,
  tag,
  title,
  lead,
  split = false,
}: {
  eyebrow: string
  tag?: React.ReactNode
  title: string
  lead: React.ReactNode
  split?: boolean
}) {
  const heading = (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <span className="eyebrow text-text-faint">{eyebrow}</span>
        {tag}
      </div>
      <h2 className="font-display text-section text-balance">{title}</h2>
    </div>
  )
  if (!split) {
    return (
      <div className="flex max-w-3xl flex-col gap-3.5">
        {heading}
        <p className="text-section-lead text-muted-foreground text-pretty">{lead}</p>
      </div>
    )
  }
  return (
    <div className="grid items-end gap-6 lg:grid-cols-2 lg:gap-18">
      {heading}
      <p className="text-section-lead text-muted-foreground text-pretty">{lead}</p>
    </div>
  )
}

/** Three short claims under a mock: a bold line and a sentence each. */
export function Points({ points }: { points: ReadonlyArray<{ title: string; body: string }> }) {
  return (
    <ul role="list" className="grid gap-5 sm:grid-cols-3 sm:gap-8 lg:gap-10">
      {points.map((p) => (
        <li key={p.title} className="flex flex-col gap-2">
          <span className="font-display text-heading">{p.title}</span>
          <span className="text-body text-muted-foreground">{p.body}</span>
        </li>
      ))}
    </ul>
  )
}
