"use client"

import { IconDots, IconSearch } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ds/Menu"
import { Select, type SelectOption } from "@/components/ds/Select"

/**
 * The table card's toolbar, the same in the library and in a playlist:
 * search (the prototype's inset well), one sort, and ⋯ for everything else.
 */
export function LibraryToolbar<S extends string>({
  query,
  onQuery,
  found,
  placeholder,
  sort,
  onSort,
  sorts,
  menuLabel,
  menu,
}: {
  query: string
  onQuery: (q: string) => void
  /** Matches while searching; null when not. */
  found: number | null
  placeholder: string
  sort: S
  onSort: (s: S) => void
  sorts: readonly SelectOption<S>[]
  menuLabel: string
  menu: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-5.5 pb-3.5">
      <label className="flex h-11 min-w-56 flex-1 items-center gap-2.5 rounded-control bg-surface-inset px-3.5">
        <IconSearch aria-hidden className="size-4 shrink-0 text-text-faint" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-text-faint"
        />
        {found !== null && <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">{found} found</span>}
      </label>
      {/* Below sm the sort and ⋯ get a row of their own, so the sort fills it. */}
      <div className="flex gap-2.5 max-sm:w-full">
        <Select aria-label="Sort tracks" value={sort} onChange={onSort} options={sorts} className="h-11 flex-1 sm:w-44 sm:flex-none" />
        {/* Nothing to offer (no untagged tracks), no ⋯ at all. */}
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="subtle" size="icon" className="size-11 shrink-0" aria-label={menuLabel}>
                <IconDots />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/** The card's last row: what's shown, a note, and "Show all" when capped. */
export function LibraryFooter({ children, showAll }: { children: React.ReactNode; showAll?: { count: number; onClick: () => void } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5.5 py-4 text-body-sm text-text-faint">
      <span>{children}</span>
      {showAll && (
        <Button size="sm" variant="subtle" onClick={showAll.onClick}>
          Show all {showAll.count}
        </Button>
      )}
    </div>
  )
}
