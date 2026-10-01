import { Disclosure } from "@/components/ds/Disclosure"

/**
 * The methodology, folded. True and important to the one owner who wonders
 * why two numbers disagree, so it stays one click away instead of sitting
 * under every report.
 */
export function HowWeCount() {
  return (
    <Disclosure variant="card" title="How we count listeners">
      <p className="max-w-[65ch] text-sm leading-relaxed">
        Listening time and peak count everyone, including listeners on the direct stream who never open your player page.
        Daily listeners, average listen and the breakdowns count player-page listens only. Days run in UTC. Listener records
        are deleted after 90 days, so countries and devices never cover more than that.
      </p>
    </Disclosure>
  )
}
