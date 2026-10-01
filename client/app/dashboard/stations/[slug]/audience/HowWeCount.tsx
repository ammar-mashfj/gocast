import { IconChevronRight } from "@tabler/icons-react"

/**
 * The methodology, folded. It is true and it matters to the one owner who
 * wonders why two numbers disagree, so it stays one click away instead of
 * sitting as a paragraph under every report.
 */
export function HowWeCount() {
  return (
    <details className="group rounded-3xl bg-card px-4 py-3 text-xs text-muted-foreground">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet [&::-webkit-details-marker]:hidden">
        <IconChevronRight
          size={14}
          aria-hidden="true"
          className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-90 motion-reduce:transition-none"
        />
        How we count listeners
      </summary>
      <p className="max-w-[60ch] pb-1 pl-5 leading-relaxed">
        Listening time and peak count everyone, including listeners on the
        direct stream who never open your player page. Daily listeners,
        average listen and the breakdowns count player-page listens only. Days
        run in UTC. Listener records are deleted after 90 days, so countries
        and devices never cover more than that.
      </p>
    </details>
  )
}
