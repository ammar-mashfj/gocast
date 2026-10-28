import { HeroStationPlayer } from "./HeroStationPlayer"
import { OFFICIAL_SLUG } from "./official"
import { Section, SectionIntro } from "../Section"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { publicApiHeaders } from "@/lib/public-api"

/**
 * Short revalidate because this is the card that claims to be live. Thirty
 * seconds is the window the rest of the public site uses, and the
 * client-side feed takes over once someone presses play — this fetch only
 * has to get the identity and the stream URLs right.
 */
async function getOfficialStation(): Promise<Station | null> {
  try {
    const res = await fetch(`${env.apiUrl}/public/stations/${OFFICIAL_SLUG}`, {
      headers: publicApiHeaders(),
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch {
    // Never throws. This sits right under the hero and must survive the API
    // being unreachable — HeroStationPlayer renders an off-air card from a
    // null station.
    return null
  }
}

/**
 * The real thing, right after the staged one: the hero acts out the
 * handover, this is a station you can actually press play on.
 */
export default async function HearOneNow() {
  const station = await getOfficialStation()

  return (
    <Section id="listen">
      <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_35rem] lg:gap-16">
        <SectionIntro
          eyebrow="Listen in"
          title="A real station, on air right now."
          lead={
            <>
              <span className="sm:hidden">Same studio you’ll get. Press play — this is what your listeners hear.</span>
              <span className="hidden sm:inline">
                The GoCast Official Station runs on the same studio you’ll get. Press play — this is what your listeners hear.
              </span>
            </>
          }
        />
        <div className="min-w-0">
          <HeroStationPlayer station={station} />
        </div>
      </div>
    </Section>
  )
}
