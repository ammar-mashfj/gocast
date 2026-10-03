import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Small labels.
 *
 *   neutral — a fact about the thing: the station's genre, "Default"
 *   pro     — the plan, amber with dark ink, mono caps ("PRO")
 *   onair   — belongs to AutoDJ
 *   ok      — a check passed, something saved ("Saved")
 *   warn    — needs attention ("Unsaved")
 */
const tag = cva("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap", {
  variants: {
    variant: {
      neutral: "rounded-chip bg-surface-control px-2.5 py-1 text-caption font-semibold text-muted-foreground",
      pro: "rounded-tag bg-fault px-1.5 py-0.75 eyebrow-sm text-fault-ink",
      onair: "rounded-chip bg-on-air-tint px-2.5 py-1 text-caption font-semibold text-on-air-text",
      ok: "rounded-chip bg-ok/12 px-2.5 py-1 text-caption font-semibold text-ok",
      warn: "rounded-chip bg-fault-tint px-2.5 py-1 text-caption font-semibold text-fault-text",
    },
  },
  defaultVariants: { variant: "neutral" },
})

export function Tag({
  variant,
  className,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof tag>) {
  return <span className={cn(tag({ variant }), className)} {...props} />
}

/** The plan tag: "PRO". */
export function ProTag({ className }: { className?: string }) {
  return <Tag variant="pro" className={className}>Pro</Tag>
}
