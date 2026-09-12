"use client"

import { useEffect, useId, useRef, useState } from "react"
import { IconCheck, IconChevronDown } from "@tabler/icons-react"

export interface SelectOption<T extends string | number> {
  value: T
  label: string
}

/**
 * A select whose popup this stylesheet can actually reach.
 *
 * A native <select> was here first and could not be themed: the option list
 * is drawn by the browser, and on Linux Chrome draws it from the platform
 * theme rather than the page's — a white listbox over a dark dialog, with the
 * items barely legible. `color-scheme: dark` fixes scrollbars and date
 * pickers but not that menu. So the menu is an element like any other here,
 * and inherits the same tokens as everything around it.
 *
 * Deliberately small: a trigger, a list, and the keyboard behaviour people
 * expect from the control it replaces. Anything richer belongs in a real
 * combobox — see TimezoneCombobox, which adds typeahead over 400 options.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  disabled?: boolean
  className?: string
  "aria-label"?: string
}) {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.find((option) => option.value === value)

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
    if (open) {
      listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" })
    }
  }, [open, highlighted])

  // Escape has to be taken before Radix sees it. Its DismissableLayer binds
  // keydown on `document` with capture, which beats any React handler here,
  // so inside a Dialog the key that should close this list was closing the
  // whole dialog and discarding the form. A capture listener on `window`
  // runs one step earlier — window captures before document — and stopping
  // propagation there keeps the dismissal local to this control.
  useEffect(() => {
    if (!open) return

    function onKeyDownCapture(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        setOpen(false)
      }
    }

    window.addEventListener("keydown", onKeyDownCapture, true)

    return () => window.removeEventListener("keydown", onKeyDownCapture, true)
  }, [open])

  function openAt(index: number) {
    setHighlighted(Math.max(0, index))
    setOpen(true)
  }

  function commit(option: SelectOption<T>) {
    onChange(option.value)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()

      if (!open) {
        openAt(options.findIndex((option) => option.value === value))

        return
      }

      setHighlighted((current) =>
        Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))),
      )

      return
    }

    if ((event.key === "Enter" || event.key === " ") && open && options[highlighted]) {
      event.preventDefault()
      commit(options[highlighted])
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        // Only while the list exists: aria-controls pointing at an element
        // that is not in the DOM is worse than saying nothing.
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${highlighted}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(options.findIndex((o) => o.value === value)))}
        onKeyDown={onKeyDown}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <IconChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full min-w-max list-none overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              onPointerEnter={() => setHighlighted(index)}
              onClick={() => commit(option)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm ${
                index === highlighted ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <IconCheck
                size={14}
                className={option.value === value ? "shrink-0" : "shrink-0 opacity-0"}
                aria-hidden
              />
              <span className="truncate">{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
