/**
 * The small Free / Pro marker that sits beside a section eyebrow.
 *
 * Shared rather than inlined twice because its whole job is to be a matched
 * pair: the moment one is restyled and the other is not, the page is saying
 * two plans are different kinds of thing. It follows the badge idiom already
 * set by PricingSection (tinted fill, matching border, matching text) so the
 * markers and the plan cards read as the same vocabulary.
 *
 * Deliberately not a solid fill. These sit directly above an h2, and a solid
 * light pill outweighs the heading it is annotating — a badge is a footnote.
 */
const PLANS = {
  free: { label: "Free", tint: "bg-violet-full/15 border-violet-border/50 text-violet-muted" },
  pro: { label: "Pro", tint: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
} as const

export function PlanBadge({ plan }: { plan: keyof typeof PLANS }) {
  const { label, tint } = PLANS[plan]
  return (
    <span
      // pe < ps on purpose: tracking adds a trailing space after the last
      // letter, which makes an evenly-padded pill look off-centre.
      className={`inline-flex items-center align-middle rounded-full border ps-2.5 pe-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${tint}`}
    >
      {label}
    </span>
  )
}
