"use client"

import * as React from "react"
import { Collapsible } from "radix-ui"
import { IconChevronDown } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * Something folded away until asked for: a troubleshooting question, the
 * encoder details under "Use your own DJ software".
 *
 *   row  — a raised row that opens beneath itself (a list of questions)
 *   card — the whole card is the toggle; its heading and a line say what
 *          is inside (a section most people skip)
 *
 * The chevron reads its own trigger's state (the group is on the trigger,
 * not the root), so a question folded inside an open card looks closed.
 */
export function Disclosure({
  title,
  description,
  variant = "row",
  defaultOpen = false,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  variant?: "row" | "card"
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Collapsible.Root
      defaultOpen={defaultOpen}
      className={cn(
        "flex flex-col",
        variant === "row" ? "rounded-control bg-surface-raised" : "gap-3 rounded-card bg-card p-5 sm:p-6",
        className,
      )}
    >
      <Collapsible.Trigger
        className={cn(
          "group/disclosure flex w-full cursor-pointer items-center justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          variant === "row" ? "rounded-control px-3.5 py-3" : "rounded-item",
        )}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className={variant === "row" ? "text-sm font-semibold" : "font-display text-heading"}>{title}</span>
          {description && <span className="text-body-sm text-muted-foreground">{description}</span>}
        </span>
        <IconChevronDown
          aria-hidden
          className="size-4 shrink-0 text-text-faint transition-transform duration-200 group-data-[state=open]/disclosure:rotate-180"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className={cn("text-body-sm text-muted-foreground", variant === "row" && "px-3.5 pb-3.5")}>
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
