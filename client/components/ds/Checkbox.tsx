"use client"

import { IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * A checkbox with its words: a real checkbox drawn as the kit's control
 * surface, filled with the off-white when checked, and the message under it
 * when it is required and missing. The whole row is the label. The register
 * page's Terms consent and the Embed dialog's control picks.
 */
export function CheckboxRow({
  checked,
  onCheckedChange,
  error,
  children,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative size-5 shrink-0">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            aria-invalid={!!error || undefined}
            className={cn(
              "peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-tag border-stroke bg-surface-control outline-none transition-colors",
              "checked:bg-foreground focus-visible:ring-2 focus-visible:ring-ring",
              error ? "border-live" : "border-transparent",
            )}
          />
          <IconCheck
            aria-hidden
            stroke={3}
            className="pointer-events-none absolute inset-0 m-auto size-3.5 text-background opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        <span className="text-body-sm leading-relaxed text-muted-foreground">{children}</span>
      </label>
      {error && (
        <p role="alert" className="px-1 text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}
