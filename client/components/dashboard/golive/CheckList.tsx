import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react"
import type { BroadcastStepInfo, StepStatus } from "@/lib/broadcast"
import { cn } from "@/lib/utils"

const STATE: Record<StepStatus, string> = { done: "Done", active: "Checking", error: "Failed", pending: "Waiting" }

/**
 * The go-live checks as they run: a green tick for a pass (green is "all
 * good", never live), a spinner for the one running, amber for a failure,
 * a quiet circle for what's still to come.
 */
export function CheckList({ steps }: { steps: BroadcastStepInfo[] }) {
  return (
    <ol aria-label="Checks" className="flex flex-col rounded-card bg-card px-5.5 py-2">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-3.5 border-t border-line py-4 first:border-t-0">
          <Glyph status={step.status} />
          <span
            className={cn(
              "flex-1 text-body font-semibold",
              step.status === "pending" ? "text-text-faint" : step.status === "error" ? "text-fault-text" : "text-foreground",
            )}
          >
            {step.label}
          </span>
          <span
            className={cn(
              "eyebrow",
              step.status === "done" ? "text-ok" : step.status === "error" ? "text-fault-text" : step.status === "active" ? "text-foreground" : "text-text-faint",
            )}
          >
            {STATE[step.status]}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Glyph({ status }: { status: StepStatus }) {
  const base = "flex size-7.5 shrink-0 items-center justify-center rounded-full"
  if (status === "done") return <span className={cn(base, "bg-ok text-background")}><IconCheck className="size-4" stroke={3} /></span>
  if (status === "active") return <span className={cn(base, "bg-surface-control")}><IconLoader2 className="size-4 animate-spin motion-reduce:animate-none" /></span>
  if (status === "error") return <span className={cn(base, "bg-fault text-fault-ink")}><IconX className="size-4" stroke={3} /></span>
  return <span className={cn(base, "bg-surface-control")} />
}
