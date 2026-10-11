import { cn } from "@/lib/utils"

/**
 * The top of a page: the 42px title, a line under it, and the page's own
 * actions on the right (wrapping under the title on narrow screens). A help
 * link usually goes in `aside` beside the title.
 */
export function PageHeader({
  title,
  description,
  aside,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Next to the title: a help link, a tag. */
  aside?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-4", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-page text-balance">{title}</h1>
          {aside}
        </div>
        {description && <p className="max-w-[65ch] text-lead text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
