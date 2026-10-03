"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Dialog as DialogPrimitive } from "radix-ui"
import { IconX } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * The dashboard's dialog, as the prototype draws its modals: a #1B1916 panel
 * with 30px corners on a 60% scrim, an 800 title, the close button in the
 * corner, and full-width 52px buttons. On phones it is the design system's
 * Sheet instead — anchored to the bottom, rounded on top, with a grabber —
 * so the actions are in thumb reach.
 *
 * Same parts and names as components/ui/dialog, so moving a dashboard dialog
 * over is an import change. Buttons go in DialogFooter as ds Buttons with
 * size="lg"; the footer makes them share the row (stacked on phones).
 */

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const content = cva(
  [
    "fixed z-50 flex flex-col gap-4.5 overflow-y-auto overscroll-contain bg-popover text-popover-foreground shadow-panel outline-none",
    // Phone: bottom sheet.
    "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-hero px-5 pt-2.5 pb-[calc(1.375rem+env(safe-area-inset-bottom))]",
    "data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom duration-200",
    // From 640px: a centred card.
    "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2.5rem)] sm:-translate-x-1/2 sm:-translate-y-1/2",
    "sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-hero sm:p-6.5",
    "sm:data-open:slide-in-from-bottom-0 sm:data-open:fade-in-0 sm:data-open:zoom-in-95",
    "sm:data-closed:slide-out-to-bottom-0 sm:data-closed:fade-out-0 sm:data-closed:zoom-out-95",
  ],
  {
    variants: {
      size: {
        sm: "sm:max-w-105",
        md: "sm:max-w-125",
        lg: "sm:max-w-150",
      },
    },
    defaultVariants: { size: "md" },
  },
)

function DialogContent({
  className,
  children,
  size,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof content> & { showCloseButton?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-black/60 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content data-slot="ds-dialog" className={cn(content({ size }), className)} {...props}>
        <span aria-hidden className="mx-auto h-1.25 w-10 shrink-0 rounded-full bg-foreground/20 sm:hidden" />
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-7 right-5 hidden size-9 items-center justify-center rounded-item bg-foreground/8 text-muted-foreground transition-colors outline-none hover:bg-foreground/12 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:top-6.5 sm:right-6.5 sm:flex"
          >
            <IconX className="size-4.5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/** Title and description. Leaves room for the close button on its right. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 sm:pr-12", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-title text-balance", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-relaxed text-pretty text-muted-foreground [&_a]:text-violet-muted [&_a]:underline-offset-4 [&_a:hover]:underline", className)}
      {...props}
    />
  )
}

/**
 * The actions. Each child takes an equal share of the row from 640px; on a
 * phone they stack with the primary action at the bottom (put it last).
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2.5 sm:flex-row sm:*:flex-1", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
