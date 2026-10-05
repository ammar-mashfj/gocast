"use client"

import * as React from "react"
import { DropdownMenu as MenuPrimitive, Popover as PopoverPrimitive } from "radix-ui"
import { IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * Floating surfaces: menus and popovers. The prototype's account menu and
 * Updates panel — #221F1C, 18–22px corners, the panel shadow, 12px-cornered
 * rows that light up a step on hover. Same part names as components/ui, so
 * moving a dashboard menu over is an import change.
 */

const floating =
  "z-50 bg-surface-control text-foreground shadow-panel outline-none " +
  "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 " +
  "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2"

const row =
  "relative flex min-h-10 cursor-default items-center gap-2.5 rounded-item px-3 py-2.5 text-sm font-medium outline-none select-none " +
  "focus:bg-surface-strong data-disabled:pointer-events-none data-disabled:opacity-45 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

// ── Menu ────────────────────────────────────────────────────────────────

const DropdownMenu = MenuPrimitive.Root
const DropdownMenuTrigger = MenuPrimitive.Trigger
const DropdownMenuGroup = MenuPrimitive.Group

function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(floating, "min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) rounded-well p-1.5", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

/** `danger` for a permanent delete only, in the error red. */
function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { variant?: "default" | "muted" | "danger" }) {
  return (
    <MenuPrimitive.Item
      data-variant={variant}
      className={cn(row, variant === "muted" && "text-muted-foreground", variant === "danger" && "text-error", className)}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(row, "pr-9", className)} {...props}>
      {children}
      <MenuPrimitive.ItemIndicator className="absolute right-3">
        <IconCheck className="size-4" />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-3 pt-2 pb-1 eyebrow text-text-faint", className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("mx-2 my-1 h-px bg-line", className)} {...props} />
}

// ── Popover ─────────────────────────────────────────────────────────────

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({ className, align = "center", sideOffset = 8, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(floating, "w-72 origin-(--radix-popover-content-transform-origin) rounded-panel p-2", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverContent,
}
