"use client"

import { Select as SelectPrimitive } from "radix-ui"
import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * Pick one of a short list. The trigger is a 40px control; the list is the
 * same floating surface as menus (ds/Menu), so it is themed rather than the
 * browser's own white listbox. Keyboard and typeahead come from Radix.
 * For hundreds of options use a combobox (TimezoneCombobox).
 */
export interface SelectOption<T extends string> {
  value: T
  label: string
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
  className,
}: {
  value: T | undefined
  onChange: (value: T) => void
  options: readonly SelectOption<T>[]
  placeholder?: string
  disabled?: boolean
  "aria-label": string
  className?: string
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-control bg-surface-control px-3.5 text-sm font-semibold text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45 data-[placeholder]:text-text-faint",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <IconChevronDown className="size-4 text-text-faint" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-well bg-surface-control p-1.5 text-foreground shadow-panel",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
          )}
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex min-h-10 cursor-default items-center rounded-item py-2.5 pr-9 pl-3 text-sm font-medium outline-none select-none data-[highlighted]:bg-surface-strong data-[disabled]:opacity-45"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3">
                  <IconCheck className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
