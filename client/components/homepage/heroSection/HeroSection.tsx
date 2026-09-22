import styles from './heroSection.module.css';
import { HeroStationPlayer } from './HeroStationPlayer';
import { TrustCues } from '@/components/common/TrustCues';
import { OFFICIAL_SLUG } from './official';
import { Station } from '@/interfaces/Station';
import { env } from '@/lib/env';
import { publicApiHeaders } from '@/lib/public-api';

interface HeroSectionProps {
  isAuthed?: boolean
}

/**
 * Short revalidate because this is the card that claims to be live. Thirty
 * seconds is the same window LiveNow uses, and the client-side feed takes over
 * from first paint anyway — this fetch only has to get the identity and the
 * stream URLs right.
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
    // Never throws. The hero is the first thing rendered on the site and it
    // must survive the API being unreachable — HeroStationPlayer renders an
    // off-air card from a null station.
    return null
  }
}

export default async function HeroSection({ isAuthed = false }: HeroSectionProps) {
  const station = await getOfficialStation()

  return (
    /*
      Three grid children, not two, so the phone can put the player between the
      copy and the call to action.

      The CTA used to live inside the copy block, which made that impossible —
      no amount of `order` can interleave a parent's children with a sibling's.
      Split out, the DOM order IS the phone order (copy, player, CTA), and the
      md: placements below fold it back into two columns: copy and CTA stacked
      on the left, player spanning both rows on the right.
    */
    <section className="relative grid grid-cols-1 md:grid-cols-[minmax(0,47fr)_minmax(0,53fr)] items-center gap-x-12 gap-y-6 md:gap-y-8 px-4 md:px-10 pt-8 md:pt-20 pb-12 md:pb-20 overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 w-[350px] md:w-[700px] h-[350px] md:h-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.08)_0%,transparent_65%)] pointer-events-none"
        aria-hidden="true"
      />

      {/* 1 — copy */}
      <div className="relative z-2 text-center md:text-left md:col-start-1 md:row-start-1 md:self-end">
        <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] px-3.5 py-1.5 rounded-full text-xs text-text-muted tracking-wide mb-5 md:mb-7">
          <div className={`w-1.5 h-1.5 bg-emerald-live rounded-full ${styles.liveDot}`} />
          Stations are live right now
        </div>

        {/* Flat, and larger to pay for it. The violet-to-pink gradient with a
            glow was the last 2021 artefact on the page, and it was a third
            accent fighting the violet/amber system the pricing and capability
            sections settled on. Size carries the emphasis the gradient used to.

            The line breaks stay manual: the three-beat stack is the shape of
            the claim. What was wrong was the scale — at 60px the longest line
            filled 60% of its column, which is what made the block read as
            floating in the corner rather than anchoring the page. */}
        <h1 className="font-display text-5xl md:text-6xl lg:text-[4.5rem] xl:text-[5rem] font-bold -tracking-[0.04em] leading-[0.95] mb-6">
          Your voice.
          <br />
          On air in
          <br />
          <span className="text-violet">60 seconds.</span>
        </h1>

        <p className="text-base md:text-[17px] text-text-secondary tracking-[0.01em] leading-relaxed max-w-[26rem] mx-auto md:mx-0">
          {isAuthed
            ? "Welcome back. Open your dashboard to manage stations or hit the studio and go live."
            : "Go live from your browser whenever you want — and let AutoDJ hold the station the rest of the week. One shareable link, no app, no listener account."}
        </p>
      </div>

      {/* 2 — the station. On a phone it sits here, between the pitch and the
          button: you hear the thing, then you are asked to do something about
          it. On md it moves to its own column and spans both rows. */}
      <div className="relative z-2 flex justify-center md:justify-end items-center md:col-start-2 md:row-start-1 md:row-span-2">
        <HeroStationPlayer station={station} />
      </div>

      {/* 3 — one call to action, deliberately. The "Listen to a station" link
          that used to sit beside it split attention on the one screen that can
          least afford it, and it competed with the player directly above: the
          card IS listening to a station, so the link was offering a worse
          version of something already on the page. */}
      <div className="relative z-2 text-center md:text-left md:col-start-1 md:row-start-2 md:self-start">
        <a
          href={isAuthed ? "/dashboard" : "/auth/register"}
          className="inline-block bg-violet-full text-white px-8 py-4 rounded-lg text-base font-medium no-underline cursor-pointer shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(139,92,246,0.4)] transition-all"
        >
          {isAuthed ? "Open dashboard" : "Create a free station"}
        </a>

        {!isAuthed && (
          <TrustCues className="mt-7 md:justify-start" />
        )}
      </div>
    </section>
  )
}
