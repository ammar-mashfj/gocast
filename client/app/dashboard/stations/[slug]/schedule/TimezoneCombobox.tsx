"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { IconCheck, IconSelector } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { supportedZones } from "@/lib/timezones"

/** How many matches to draw. The list is ~400 zones; nobody scrolls past 50. */
const MAX_RESULTS = 50

/**
 * The browser's own tz database, so the options can never drift from the list
 * the server validates against. Engines without supportedValuesOf fall back to
 * the zone they are in, which is the only value most owners will ever pick.
 */
function allZones(current: string | null): string[] {
  // By current names: Chrome lists Asia/Calcutta, not Asia/Kolkata.
  const zones = supportedZones()

  return current && !zones.includes(current) ? [current, ...zones] : zones
}

/**
 * "GMT+3" for a zone, as a hint beside its name.
 *
 * Display only — never stored. An offset is what people recognise, but it is
 * also the thing that changes twice a year, which is why the value saved is
 * always the IANA name.
 */
function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date())

    return parts.find((part) => part.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

/**
 * Searchable timezone picker.
 *
 * A native <select> was the first cut and had to go: the popup is painted by
 * the browser rather than the page, so it renders in the platform's own light
 * chrome on a dark UI, and a flat list of four hundred zones with no filter is
 * a scroll either way. This is the same control drawn in the app's own theme,
 * with typeahead.
 */
export function TimezoneCombobox({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (zone: string) => void
  id?: string
}) {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const zones = useMemo(() => allZones(value), [value])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "_")

    return zones.filter((zone) => zone.toLowerCase().includes(needle)).slice(0, MAX_RESULTS)
  }, [zones, query])

  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" })
  }, [highlighted])

  // Every way in starts a fresh search from the top of the list.
  function openList() {
    if (open) return
    setQuery("")
    setHighlighted(0)
    setOpen(true)
  }

  function commit(zone: string) {
    onChange(zone)
    setOpen(false)
    setQuery("")
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)

      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        openList()

        return
      }
      setHighlighted((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1

        return Math.max(0, Math.min(matches.length - 1, next))
      })

      return
    }

    if (event.key === "Enter" && open && matches[highlighted]) {
      event.preventDefault()
      commit(matches[highlighted])
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      // Closes when focus leaves the field (Tab, or a click anywhere else),
      // not only on Escape — a list left open over the dialog's Save hides it.
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          // Both only while the list exists — pointing at an element that is
          // not in the DOM says less than saying nothing. activedescendant is
          // what makes arrow navigation audible: without it the highlight
          // moves visually and a screen reader announces nothing, so there is
          // no way to know what Enter will commit.
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open ? `${listboxId}-${highlighted}` : undefined}
          aria-autocomplete="list"
          // Closed, this reads as the current setting; open, it is a search
          // box. One element rather than two so the caret lands where the
          // eye already is.
          value={open ? query : value}
          placeholder={value}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlighted(0)
            setOpen(true)
          }}
          // Focus alone doesn't open the list: the Timezone dialog focuses
          // this field as it opens, and the list would pop up over Save. The
          // text is selected instead, so typing replaces the zone name and
          // starts a search; a click or an arrow key opens the full list.
          onFocus={(e) => e.target.select()}
          onClick={openList}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-control bg-surface-control px-3.5 pr-10 text-sm font-medium text-foreground outline-none placeholder:text-text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <IconSelector
          size={16}
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-text-faint"
          aria-hidden
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          // Keeps focus in the field while picking or scrolling the list, so
          // the blur above doesn't close it before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-50 mt-1.5 max-h-64 w-full list-none overflow-y-auto rounded-well bg-surface-control p-1.5 text-foreground shadow-panel"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No matching timezone</li>
          )}
          {matches.map((zone, index) => (
            <li
              key={zone}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={zone === value}
              onPointerEnter={() => setHighlighted(index)}
              onClick={() => commit(zone)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-item px-3 py-2 text-sm font-medium",
                index === highlighted && "bg-surface-strong",
              )}
            >
              <span className="truncate">
                {zone === value && <IconCheck aria-hidden className="mr-1.5 inline size-3.5 align-middle" />}
                {zone}
              </span>
              <span className="shrink-0 font-mono text-caption text-text-faint tabular-nums">
                {offsetLabel(zone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
