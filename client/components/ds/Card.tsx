import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import Link from "next/link"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * The page's surfaces. Hierarchy is lightness, not borders or shadows:
 *
 *   card    #181614 — every section of a page (26px corners, 24px padding)
 *   raised  #1D1A17 — a tile or row inside a card (setup items, show times)
 *   inset   #0E0D0C — a well cut into a card (your link, code, embed preview)
 *   outline no fill, a hairline — the quiet "Delete this station" row
 *   onair / live / warn / pro — a card that is a state (the overview hero,
 *   the Pro plan card)
 *
 * `size` sets corners and padding: `md` for page sections, `sm` for tiles
 * and wells inside them.
 */
const card = cva("flex min-w-0 flex-col", {
  variants: {
    tone: {
      card: "bg-card text-foreground",
      raised: "bg-surface-raised text-foreground",
      inset: "bg-surface-inset text-foreground",
      outline: "border-stroke border-line-strong text-foreground",
      onair: "bg-on-air-tint text-foreground",
      live: "surface-live",
      warn: "bg-fault text-fault-ink",
      pro: "bg-pro-tint text-fault-text",
    },
    size: {
      md: "gap-3.5 rounded-card p-5 sm:p-6",
      sm: "gap-2.5 rounded-well p-4",
      none: "",
    },
    interactive: {
      true: "text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    },
  },
  compoundVariants: [
    { tone: "card", interactive: true, className: "hover:bg-surface-raised" },
    { tone: "raised", interactive: true, className: "hover:bg-surface-control" },
    { tone: "inset", interactive: true, className: "hover:bg-card" },
  ],
  defaultVariants: { tone: "card", size: "md" },
})

export interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof card> {
  /** Render as the child (a Link, a button) instead of a div. */
  asChild?: boolean
}

export function Card({ tone, size, interactive, asChild, className, ...props }: CardProps) {
  const Comp = asChild ? Slot.Root : "div"
  return <Comp data-slot="ds-card" className={cn(card({ tone, size, interactive }), className)} {...props} />
}

/**
 * A card's first row: its title, and on the right a quiet note ("Last 14
 * days") or a link ("All shows →"). Wraps under the title on narrow cards.
 */
export function CardHeader({
  title,
  aside,
  description,
  as: Heading = "h2",
  className,
}: {
  title: React.ReactNode
  aside?: React.ReactNode
  description?: React.ReactNode
  as?: "h2" | "h3"
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Heading className="font-display text-heading">{title}</Heading>
        {description && <p className="text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {aside && <div className="shrink-0 text-body-sm text-text-faint">{aside}</div>}
    </div>
  )
}

/** The quiet link in a card header's corner: "Schedule →". */
export function CardLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("text-body-sm font-semibold text-muted-foreground transition-colors hover:text-foreground", className)}>
      {children}
    </Link>
  )
}
