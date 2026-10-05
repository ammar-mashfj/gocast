import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

/**
 * The dashboard's button: the GoCast Design System's Button
 * (docs/design/dashboard-prototype/ds-components.js), sized for desktop.
 *
 * Colour carries meaning, so most buttons are neutral: `primary` off-white,
 * `ghost` a hairline, `subtle` a faint fill. The coloured ones say what they
 * do — `live` (going or being live), `onair` (AutoDJ), `pro` (the Pro
 * plan), `danger` (a permanent delete, and nothing else).
 *
 * `ink` is for a solid red or amber surface (the status band, the live hero):
 * dark ink fill with the surface colour as its text. The surface sets both
 * through `--ink` / `--paper`, so this button needs no knowledge of which.
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold select-none",
    "transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98]",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-foreground text-background hover:bg-foreground/90",
        ghost: "border-stroke border-line-strong bg-transparent text-foreground hover:bg-foreground/5",
        subtle: "bg-foreground/8 text-foreground hover:bg-foreground/12",
        quiet: "bg-transparent text-muted-foreground hover:bg-surface-raised hover:text-foreground",
        live: "bg-live text-live-ink hover:bg-live/90",
        onair: "border-stroke border-on-air/40 bg-transparent text-on-air-text hover:bg-on-air/10",
        "onair-soft": "bg-on-air/18 text-on-air-text hover:bg-on-air/25",
        pro: "bg-fault text-fault-ink hover:bg-fault/90",
        // A permanent delete (station, account): the error red, behind a
        // typed confirmation. Ending a show or removing tracks is not this.
        danger: "bg-error text-live-ink hover:bg-error/90",
        // The quiet way in to a permanent delete ("Delete station…"): the
        // red is in the words, the action itself is behind a ConfirmDialog.
        "danger-quiet": "bg-foreground/6 text-error hover:bg-foreground/10",
        ink: "bg-(--ink) text-(--paper) hover:opacity-90",
      },
      size: {
        sm: "h-8.5 rounded-item px-3.5 text-body-sm font-bold [&_svg:not([class*='size-'])]:size-4",
        md: "h-10 rounded-control px-4 text-sm [&_svg:not([class*='size-'])]:size-4.5",
        lg: "h-13 rounded-button px-5 text-base [&_svg:not([class*='size-'])]:size-5",
        xl: "h-16 rounded-button-xl px-6 text-lg [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8.5 rounded-item [&_svg:not([class*='size-'])]:size-4",
        icon: "size-10 rounded-control [&_svg:not([class*='size-'])]:size-4.5",
      },
      full: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** A status dot before the label: `live` for "Go live", `current` for the text colour. */
  dot?: "live" | "current"
}

export function Button({ className, variant, size, full, asChild = false, dot, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  const classes = cn(buttonVariants({ variant, size, full }), className)
  if (!dot) {
    return <Comp data-slot="ds-button" className={classes} {...props}>{children}</Comp>
  }
  // The dot and the Slottable must be the Slot's direct children (no
  // fragment), or asChild merges onto the fragment instead of the link.
  return (
    <Comp data-slot="ds-button" className={classes} {...props}>
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", dot === "live" ? "bg-live" : "bg-current")} />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Comp>
  )
}
