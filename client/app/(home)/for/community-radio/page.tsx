import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { CommunityOnAirDemo } from "@/components/use-cases/community/CommunityOnAirDemo"
import { HandoverPicture, PresenterRelay } from "@/components/use-cases/community/CommunityPictures"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/community-radio — the fifth audience page (docs/USE-CASE-PAGES-PLAN.md):
 * local groups with several volunteer presenters.
 *
 * Its own shape: a full-width headline over a split, and a horizontal relay
 * of presenters as the centrepiece.
 *
 * Checked 2026-11-23, and the page is careful about both:
 *  - There are NO presenter accounts: one login per station (no team or
 *    member model). Presenters sign in with the station's account; the Terms
 *    make the holder responsible for all activity. Said plainly in the FAQ.
 *  - There is NO public schedule: show times were retired from the web
 *    (2026-10-18). Never imply listeners can see what's on when.
 * What is real: the station takes one live source at a time; a presenter
 * whose Go live is blocked sees "You’re already live" and the page opens by
 * itself when that show ends (live/page.tsx polls every 3 s). Only a live
 * source blocks; going live takes over from AutoDJ at once. Recorded shows in
 * on-time slots are Pro. Never mention the Free idle check (off on prod).
 */

const PATH = "/for/community-radio"
const TITLE = "Community Radio Station: Many Presenters, One Link"
const DESCRIPTION =
  "Start an online community radio station. Presenters go live from their own laptops, one after another; recorded shows play on time with Pro. Free to start."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const POINTS = [
  {
    title: "No studio to book",
    body: "Each presenter broadcasts from wherever they are: a kitchen, a school hall, the community centre. A laptop and a mic is a studio.",
    plan: "free" as const,
  },
  {
    title: "Recorded shows, on time",
    body: "Volunteers who can’t be live upload their show and it plays in its own slot, starting on the dot. Music from local bands fills the gaps.",
    plan: "pro" as const,
  },
  {
    title: "On your group’s website",
    body: "Put the live player on your website so neighbours can press play where they already read your news.",
    plan: "pro" as const,
  },
]

const FAQS: Faq[] = [
  {
    q: "Can each presenter have their own login?",
    a: (
      <>
        Not yet. Today a station has one account, and presenters sign in to it from their own computer. Whoever holds
        the account is responsible for everything that goes out on it, so share the login only with people you trust,
        and change the password when a presenter leaves.
      </>
    ),
    text: "Not yet. Today a station has one account, and presenters sign in to it from their own computer. Whoever holds the account is responsible for everything that goes out on it, so share the login only with people you trust, and change the password when a presenter leaves.",
  },
  {
    q: "What happens if two presenters try to go live at once?",
    a: (
      <>
        The station takes one live voice at a time. The second presenter’s Go live page says the station is already
        live, and it turns back into the normal Go live screen by itself as soon as the first show ends. Nobody gets cut
        off mid-sentence.
      </>
    ),
    text: "The station takes one live voice at a time. The second presenter's Go live page says the station is already live, and it turns back into the normal Go live screen by itself as soon as the first show ends. Nobody gets cut off mid-sentence.",
  },
  {
    q: "Can volunteers record their show and have it play later?",
    a: (
      <>
        Yes, on Pro. Upload the recording, put it in a playlist of its own and give it a weekly slot set to start
        exactly on time. Going live always takes over from a recorded show, so a presenter can still jump in.{" "}
        <Link href="/help/schedule-playlists-by-time">Scheduling by time</Link>.
      </>
    ),
    text: "Yes, on Pro. Upload the recording, put it in a playlist of its own and give it a weekly slot set to start exactly on time. Going live always takes over from a recorded show, so a presenter can still jump in.",
  },
  {
    q: "Can listeners see our programme schedule?",
    a: (
      <>
        Not on the GoCast player: it shows what’s on air now. Put your weekly line-up on your website or social
        pages next to the station link. Listeners can also leave their email on the player to hear when you’re next
        live.
      </>
    ),
    text: "Not on the GoCast player: it shows what's on air now. Put your weekly line-up on your website or social pages next to the station link. Listeners can also leave their email on the player to hear when you're next live.",
  },
  {
    q: "Is it free?",
    a: (
      <>
        Going live is free, from any browser, for as long as you like, to up to 100 listeners at once, with no card.
        The station is on air while someone is live. Pro adds recorded shows on a schedule, music between shows, the
        player on your website and up to 1,000 listeners.{" "}
        <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Going live is free, from any browser, for as long as you like, to up to 100 listeners at once, with no card. The station is on air while someone is live. Pro adds recorded shows on a schedule, music between shows, the player on your website and up to 1,000 listeners.",
  },
  {
    q: "Can we play music on our station?",
    a: (
      <>
        You can, with the right licence. Playing other people’s music online usually needs a licence for the countries
        your listeners are in, and GoCast doesn’t provide one. Talk, local news, interviews, and music from local bands
        who’ve said yes need nothing extra.
      </>
    ),
    text: "You can, with the right licence. Playing other people's music online usually needs a licence for the countries your listeners are in, and GoCast doesn't provide one. Talk, local news, interviews, and music from local bands who've said yes need nothing extra.",
  },
]

export default function CommunityRadioPage() {
  const url = `${env.appUrl}${PATH}`
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: TITLE,
        description: DESCRIPTION,
        isPartOf: { "@id": `${env.appUrl}/#website` },
        about: { "@id": `${env.appUrl}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GoCast", item: `${env.appUrl}/` },
          { "@type": "ListItem", position: 2, name: "For community radio", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero: the headline runs the full measure; pitch and demo split under it. */}
      <section>
        <div className="mx-auto flex w-full max-w-page flex-col gap-10 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:gap-14 lg:pt-20 lg:pb-28">
          <div className="flex flex-col gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For community radio</span>
            </nav>
            <h1 className="max-w-[16em] font-display text-marquee text-balance max-[359px]:text-[2.25rem]">
              Your neighbourhood’s radio station, run by your neighbours.
            </h1>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
            <div className="flex flex-col gap-6">
              <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
                Every presenter goes live from their own laptop, one show after another, on one station with one link.
                No studio, no transmitter, no software to install. Free to start.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button asChild size="xl" className="w-full sm:w-auto">
                  <Link href="/auth/register" className="no-underline">
                    Start your community station
                  </Link>
                </Button>
                <Link href="#evening" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                  See an evening →
                </Link>
              </div>
              <TrustCues className="justify-start!" />
            </div>
            <div className="flex min-w-0 justify-center lg:justify-end">
              <CommunityOnAirDemo />
            </div>
          </div>
        </div>
      </section>

      <Section id="evening">
        <SectionIntro
          split
          eyebrow="An evening on Eastside"
          title="Five voices, one station, no studio."
          lead="Community radio is a relay. Each presenter takes the station, does their show from wherever they are and hands it on. Recorded shows and local music keep it going when nobody’s live."
        />
        <PresenterRelay />
      </Section>

      <Section id="handover">
        <SectionIntro
          eyebrow="The handover"
          title="The next presenter’s page knows when it’s their turn."
          lead="Your station takes one live voice at a time. If the next presenter opens Go live early, it tells them someone is on air, then opens up by itself the moment that show ends. Nobody is cut off, and nobody has to text the person before them."
        />
        <HandoverPicture />
      </Section>

      <Section id="what-you-get">
        <SectionIntro
          eyebrow="What community stations use"
          title="Made for volunteers."
          lead="The three things community stations on GoCast rely on."
        />
        <ul role="list" className="flex flex-col divide-y divide-line border-y border-line">
          {POINTS.map((p, i) => (
            <li key={p.title} className="grid gap-3 py-7 sm:grid-cols-[4rem_minmax(0,18rem)_minmax(0,1fr)] sm:gap-8 sm:py-9">
              <span className="font-mono text-body-sm tabular-nums text-text-faint">0{i + 1}</span>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-display text-card-title">{p.title}</h3>
                {p.plan === "pro" ? <ProTag /> : <Tag variant="ok">Free</Tag>}
              </div>
              <p className="text-body text-muted-foreground text-pretty">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Questions from community groups" title="Before your first show." lead="What community groups ask us before they go on air." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Your first show, this week.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your community station in under a minute and go live from a browser. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your community station
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
