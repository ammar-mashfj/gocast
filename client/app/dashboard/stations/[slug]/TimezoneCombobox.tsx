"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { IconCheck, IconSelector } from "@tabler/icons-react"

/** How many matches to draw. The list is ~400 zones; nobody scrolls past 50. */
const MAX_RESULTS = 50

/**
 * The browser's own tz database, so the options can never drift from the list
 * the server validates against. Engines without supportedValuesOf fall back to
 * the zone they are in, which is the only value most owners will ever pick.
 */
function allZones(current: string | null): string[] {
  let zones: string[] = []

  try {
    zones = Intl.supportedValuesOf("timeZone")
  } catch {
    zones = [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }

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
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", onPointerDown)

    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" })
  }, [highlighted])

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
      setOpen(true)
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
    <div ref={rootRef} className="relative">
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
          onFocus={() => {
            setQuery("")
            setHighlighted(0)
            setOpen(true)
          }}
          // Escape closes the list without moving focus, so onFocus will not
          // fire again — without this, clicking the field afterwards does
          // nothing and the only way back in is Tab or an arrow key.
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 pr-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <IconSelector
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full list-none overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {matches.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matching timezone</li>
          )}
          {matches.map((zone, index) => (
            <li
              key={zone}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={zone === value}
              onPointerEnter={() => setHighlighted(index)}
              onClick={() => commit(zone)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm ${
                index === highlighted ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <span className="truncate">
                {zone === value && <IconCheck size={14} className="mr-1.5 inline align-[-2px]" />}
                {zone}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {offsetLabel(zone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
