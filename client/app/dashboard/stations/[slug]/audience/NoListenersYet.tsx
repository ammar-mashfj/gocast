import Link from "next/link"
import { CopyButton } from "@/components/dashboard/CopyButton"

interface NoListenersYetProps {
  playerUrl: string
  stationName: string
  /** The sentence above the link: what the page would have shown, honestly. */
  message: string
  /** Optional wider-range link, when the station had listeners before. */
  wider?: { href: string; label: string }
}

/**
 * What the Audience page says to a station nobody has heard yet.
 *
 * Replaces four "—" tiles, an empty chart, four empty breakdowns and a
 * methodology footnote: a wall of absence that answered "is anyone there?"
 * with a spreadsheet. The one thing that changes the answer is the link, so
 * the link is what the page offers — the same well and Share button the
 * overview's share panel uses.
 */
export function NoListenersYet({ playerUrl, stationName, message, wider }: NoListenersYetProps) {
  return (
    <section className="flex max-w-xl flex-col gap-4 py-2" aria-label="No listeners yet">
      <p className="text-sm leading-relaxed text-foreground">{message}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Listeners tune in at</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.09] bg-[#08080d]/60 py-1 pl-3 pr-1">
          <code className="truncate font-mono text-xs text-muted-foreground">
            {playerUrl.replace(/^https?:\/\//, "")}
          </code>
          <CopyButton text={playerUrl} title={stationName} />
        </div>
      </div>

      {wider && (
        <Link
          href={wider.href}
          className="self-start text-sm text-violet-muted underline-offset-4 hover:underline"
        >
          {wider.label}
        </Link>
      )}
    </section>
  )
}
