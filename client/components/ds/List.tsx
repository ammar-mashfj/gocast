import * as React from "react"
import Link from "next/link"
import { IconChevronRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * Rows.
 *
 *   List + ListRow — the design system's ListRow: title, a quiet line under
 *     it, something on the right (a mono duration, a button). Rows are
 *     divided by hairlines; the first has none, so a list sits flush under
 *     a card header.
 *   ActionRow — a raised, clickable tile that goes somewhere: "Add station
 *     artwork ›". For checklists and settings shortcuts.
 */
export function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-col [&>li+li]:border-t [&>li+li]:border-line", className)} {...props} />
}

export interface ListRowProps extends Omit<React.ComponentProps<"li">, "title"> {
  title: React.ReactNode
  meta?: React.ReactNode
  leading?: React.ReactNode
  /** A string renders as a mono readout (a length, a count). */
  trailing?: React.ReactNode
}

export function ListRow({ title, meta, leading, trailing, className, ...props }: ListRowProps) {
  return (
    <li className={cn("flex items-center gap-3 py-3", className)} {...props}>
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <span className="truncate text-body font-semibold">{title}</span>
        {meta && <span className="truncate text-caption text-text-faint">{meta}</span>}
      </div>
      {typeof trailing === "string" ? (
        <span className="shrink-0 font-mono text-body-sm text-muted-foreground tabular-nums">{trailing}</span>
      ) : (
        trailing
      )}
    </li>
  )
}

export interface ActionRowProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Goes somewhere: rendered as a Link. With onClick instead, a button; with neither, a still tile. */
  href?: string
  onClick?: () => void
  className?: string
}

export function ActionRow({ title, description, href, onClick, className }: ActionRowProps) {
  const classes = cn(
    "flex w-full items-center justify-between gap-3 rounded-well bg-surface-raised p-4 text-left transition-colors",
    "outline-none hover:bg-surface-control focus-visible:ring-2 focus-visible:ring-ring",
    className,
  )
  const inner = (
    <>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-body font-semibold">{title}</span>
        {description && <span className="text-body-sm text-muted-foreground">{description}</span>}
      </span>
      <IconChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </>
  )
  if (href) return <Link href={href} onClick={onClick} className={classes}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{inner}</button>
  // Nowhere to go (a goal, not a task): the same tile, still, without the ›.
  return (
    <div className={cn(classes, "hover:bg-surface-raised")}>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-body font-semibold">{title}</span>
        {description && <span className="text-body-sm text-muted-foreground">{description}</span>}
      </span>
    </div>
  )
}
