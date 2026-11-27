import type { Metadata } from "next"
import Link from "next/link"
import { IconBellRinging, IconCode, IconMapPin, IconWorld } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { HourClock } from "@/components/use-cases/news/HourClock"
import { NewsConsoleDemo } from "@/components/use-cases/news/NewsConsoleDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/news — the third audience page (docs/USE-CASE-PAGES-PLAN.md):
 * hyperlocal, independent and exile newsrooms.
 *
 * Its own shape: the hero is mirrored (picture left), the centrepiece is a
 * radio hour clock, and the page leans on one Pro feature — on-time starts.
 *
 * Checked 2026-11-23 before promising "on the hour": `autodj_slots.start_mode`
 * hard is on main and on prod (52 hard slots in use). A hard slot hands out
 * only songs that end in time, else cuts the last with a 2 s fade; under 20 s
 * to go it starts that much early (docs/features/schedule.md). So: on the
 * hour, never late, up to 20s early at most — while AutoDJ is on air; a
 * live show always wins. A one-track slot longer than the track repeats it,
 * hence the FAQ's "make the slot as long as the bulletin". Never mention the
 * Free idle check (off on prod), and never promise anonymity or getting past
 * a block: nothing in the product does either.
 */

const PATH = "/for/news"
const TITLE = "News Radio Station: Bulletins on the Hour"
const DESCRIPTION =
  "Run an online news radio station: bulletins on the hour, music and talk between, and breaking news live from any browser. Listeners need no app."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const FEATURES = [
  {
    icon: IconWorld,
    title: "Heard wherever your readers are",
    body: "One link opens the player in any browser, on any phone. No app, no account, nothing for listeners to install.",
    pro: false,
  },
  {
    icon: IconBellRinging,
    title: "Listeners told when you’re live",
    body: "Off air, your player page lets listeners leave an email, and they hear from us when you next go live.",
    pro: false,
  },
  {
    icon: IconCode,
    title: "The player on your news site",
    body: "Embed the live player on your homepage or above an article with one copied snippet.",
    pro: true,
  },
  {
    icon: IconMapPin,
    title: "Know where your audience is",
    body: "Ninety days of listener history by day and by country. The live count and all-time peak are free on every plan.",
    pro: true,
  },
]

const FAQS: Faq[] = [
  {
    q: "Will the news really start on the hour?",
    a: (
      <>
        Yes, when AutoDJ is on air and the slot is set to start exactly on time (Pro). Before the hour, AutoDJ only
        picks songs that finish in time; if none fits, it fades the last one out. It never starts late, and at most 20
        seconds early rather than play a few seconds of a song. If you’re live at that moment, your live show carries on;
        the bulletin never interrupts you. <Link href="/help/schedule-playlists-by-time">Scheduling by time</Link>.
      </>
    ),
    text: "Yes, when AutoDJ is on air and the slot is set to start exactly on time (Pro). Before the hour, AutoDJ only picks songs that finish in time; if none fits, it fades the last one out. It never starts late, and at most 20 seconds early rather than play a few seconds of a song. If you're live at that moment, your live show carries on; the bulletin never interrupts you.",
  },
  {
    q: "How do I play a recorded bulletin every hour?",
    a: (
      <>
        Put your bulletin in a playlist of its own and add a slot for it at each hour you want, set to start exactly on
        time. Make each slot as long as the bulletin: a slot longer than the only recording in it plays it again. When
        you record a new bulletin, upload it and remove the old one.{" "}
        <Link href="/help/playlists-and-the-rotation">Playlists and the rotation</Link>.
      </>
    ),
    text: "Put your bulletin in a playlist of its own and add a slot for it at each hour you want, set to start exactly on time. Make each slot as long as the bulletin: a slot longer than the only recording in it plays it again. When you record a new bulletin, upload it and remove the old one.",
  },
  {
    q: "Can I go live with breaking news from my phone?",
    a: (
      <>
        Yes. Open your station in the phone’s browser and go live, with nothing to install. Keep the studio on screen
        with the display on: phones pause a browser tab you switch away from, and a paused tab can’t send audio.{" "}
        <Link href="/blog/broadcasting-from-your-phone">Broadcasting from your phone</Link>.
      </>
    ),
    text: "Yes. Open your station in the phone's browser and go live, with nothing to install. Keep the studio on screen with the display on: phones pause a browser tab you switch away from, and a paused tab can't send audio.",
  },
  {
    q: "Is it free?",
    a: (
      <>
        Going live is free: from a browser, for as long as you like, to up to 100 listeners at once, with no card. The
        station is on air while you are live. Pro adds AutoDJ, on-time bulletins, the player on your site, listener
        history by country and up to 1,000 listeners. <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Going live is free: from a browser, for as long as you like, to up to 100 listeners at once, with no card. The station is on air while you are live. Pro adds AutoDJ, on-time bulletins, the player on your site, listener history by country and up to 1,000 listeners.",
  },
  {
    q: "Can people listen from another country?",
    a: (
      <>
        Yes. Your station is on the open web, so anyone with the link can listen from anywhere it isn’t blocked, and on
        Pro your audience page shows which countries they’re in. GoCast doesn’t hide who runs a station or get around
        blocks; if that matters for your reporting, plan for it separately.
      </>
    ),
    text: "Yes. Your station is on the open web, so anyone with the link can listen from anywhere it isn't blocked, and on Pro your audience page shows which countries they're in. GoCast doesn't hide who runs a station or get around blocks; if that matters for your reporting, plan for it separately.",
  },
  {
    q: "Can we play music between bulletins?",
    a: (
      <>
        You can, with the licence for it. Playing other people’s music online usually needs a licence for the countries
        your listeners are in, and GoCast doesn’t provide one. Talk, interviews, your own features and music you’re
        cleared to stream need nothing extra.
      </>
    ),
    text: "You can, with the licence for it. Playing other people's music online usually needs a licence for the countries your listeners are in, and GoCast doesn't provide one. Talk, interviews, your own features and music you're cleared to stream need nothing extra.",
  },
]

export default function NewsPage() {
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
          { "@type": "ListItem", position: 2, name: "For news", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero, mirrored: the clock on the left, the pitch on the right. */}
      <section>
        <div className="mx-auto grid w-full max-w-page grid-cols-[minmax(0,1fr)] items-center gap-12 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="flex justify-center lg:order-2 lg:justify-start">
            <div className="flex flex-col gap-6">
              <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
                <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                  GoCast
                </Link>
                <span aria-hidden className="px-2">/</span>
                <span aria-current="page">For news</span>
              </nav>
              <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
                The news on the hour. Breaking news in seconds.
              </h1>
              <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
                A radio station for your newsroom: bulletins that start on the dot, music and talk between them, and a
                browser tab that puts you on air the moment a story breaks. Listeners tap one link, anywhere.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button asChild size="xl" className="w-full sm:w-auto">
                  <Link href="/auth/register" className="no-underline">
                    Start your news station
                  </Link>
                </Button>
                <Link href="#hour" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                  See the hour →
                </Link>
              </div>
              <TrustCues className="justify-start!" />
            </div>
          </div>
          <div className="flex min-w-0 justify-center lg:order-1">
            <NewsConsoleDemo />
          </div>
        </div>
      </section>

      <Section id="hour">
        <SectionIntro
          split
          eyebrow="The news hour"
          title="Draw your hour once. The station keeps it."
          lead="Radio newsrooms plan the hour as a clock. On GoCast the bulletins are slots that start on time, everything else plays around them, and a live voice can take over at any minute."
        />
        <HourClock />
      </Section>

      <Section id="breaking">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="eyebrow text-text-faint">Breaking news</span>
              <Tag variant="ok">Free</Tag>
            </div>
            <h2 className="font-display text-section text-balance">On air from wherever the story is.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              Open your station in a browser, on the newsroom laptop or your phone at the scene, and press Go live.
              GoCast checks your connection first and sends at a bitrate it can hold, so a weak signal doesn’t drop
              you mid-sentence.
            </p>
            <p>
              Your listeners don’t change a thing. The same link they already have plays you live, and on Pro the
              station goes back to its schedule when you finish.
            </p>
          </div>
        </div>
      </Section>

      <Section id="features">
        <SectionIntro
          eyebrow="For newsrooms"
          title="Built to be found and heard."
          lead="What independent and local newsrooms use most. Two are free on every station; two come with Pro."
        />
        <ul role="list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col gap-4 rounded-card bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <f.icon size={24} aria-hidden className="text-foreground" />
                {f.pro ? <ProTag /> : <Tag variant="ok">Free</Tag>}
              </div>
              <h3 className="font-display text-heading">{f.title}</h3>
              <p className="text-body-sm text-muted-foreground text-pretty">{f.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Newsroom questions" title="Before your first bulletin." lead="What newsrooms ask us before they go on air." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Your first bulletin, today.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your news station in under a minute and go live from your browser. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your news station
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
