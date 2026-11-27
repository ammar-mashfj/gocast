import type { Metadata } from "next"
import Link from "next/link"
import { IconBroadcast, IconCalendarRepeat, IconCode, IconHeartHandshake } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { SetupChain, SundayRunSheet } from "@/components/use-cases/churches/ChurchPictures"
import { ChurchPlayerDemo } from "@/components/use-cases/churches/ChurchPlayerDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/churches — the first audience page (docs/USE-CASE-PAGES-PLAN.md).
 *
 * Written for one search: a church that wants its services heard online,
 * by the people who can't be in the room. Every claim is checked against
 * the product: live from the browser is Free; AutoDJ, the schedule, the
 * embed and the 1,000-listener cap are Pro. Never mention the Free idle
 * check ("Still at the desk?"): it is built but switched off on prod.
 *
 * Static on purpose — no session read — so the page is prerendered and the
 * CTA is always sign-up (signed-in visitors are sent on from there).
 */

const PATH = "/for/churches"
const TITLE = "Church Radio: Stream Your Services Live Online"
const DESCRIPTION =
  "Stream your church service live from the sound desk. Members tap one link, no app needed. Free for live services; Pro plays worship music all week."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const FEATURES = [
  {
    icon: IconBroadcast,
    title: "Live from the sound desk",
    body: "Pick the desk’s USB interface as your microphone and the congregation hears the same mix as the room. No encoder, no streaming software.",
    pro: false,
  },
  {
    icon: IconHeartHandshake,
    title: "For everyone who can’t be there",
    body: "The housebound, the sick, members working Sunday or living abroad. They open a link on any phone, with no app and no account.",
    pro: false,
  },
  {
    icon: IconCalendarRepeat,
    title: "Worship music between services",
    body: "Upload your songs and sermons, set a weekly schedule, and the station stays on air all week. Go live and you take over; finish and the music comes back.",
    pro: true,
  },
  {
    icon: IconCode,
    title: "On your church website",
    body: "Put the live player on your own site with one copied snippet, so the website’s Listen button plays the service.",
    pro: true,
  },
]

const FAQS: Faq[] = [
  {
    q: "Is it really free to stream our services?",
    a: (
      <>
        Yes. On Free you can broadcast live from a browser for as many hours as you like, to up to 100 listeners at
        once, with no card. The station is on air while you are live and quiet when you finish. Pro adds worship
        music between services, a weekly schedule, the player on your website and up to 1,000 listeners.{" "}
        <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Yes. On Free you can broadcast live from a browser for as many hours as you like, to up to 100 listeners at once, with no card. The station is on air while you are live and quiet when you finish. Pro adds worship music between services, a weekly schedule, the player on your website and up to 1,000 listeners.",
  },
  {
    q: "Do members need an app or an account to listen?",
    a: (
      <>
        No. You share one link, in the bulletin, the church WhatsApp group or on your website, and it opens the
        player in any browser, on a phone, tablet or computer. Listeners can also leave their email on the player to
        hear when you next go live.
      </>
    ),
    text: "No. You share one link, in the bulletin, the church WhatsApp group or on your website, and it opens the player in any browser, on a phone, tablet or computer. Listeners can also leave their email on the player to hear when you next go live.",
  },
  {
    q: "Can we use our sound desk and microphones?",
    a: (
      <>
        Yes. Connect the desk’s output to the laptop, usually through a USB audio interface, and choose it as the
        microphone in the GoCast studio. Whatever the desk sends, the pulpit mic, the choir and the band, is what
        goes out. <Link href="/help/go-live-from-your-browser">How to go live from your browser</Link>.
      </>
    ),
    text: "Yes. Connect the desk's output to the laptop, usually through a USB audio interface, and choose it as the microphone in the GoCast studio. Whatever the desk sends, the pulpit mic, the choir and the band, is what goes out.",
  },
  {
    q: "Will the stream stop in the middle of a long service?",
    a: (
      <>
        Not while the studio is open. Keep the GoCast tab open on the laptop for the whole service, and keep the
        laptop plugged in and awake. If the browser closes, the broadcast ends with it. On Pro, if the laptop drops
        off, AutoDJ carries on with your music until you are back.{" "}
        <Link href="/help/my-station-went-off-air">Why a station goes off air</Link>.
      </>
    ),
    text: "Not while the studio is open. Keep the GoCast tab open on the laptop for the whole service, and keep the laptop plugged in and awake. If the browser closes, the broadcast ends with it. On Pro, if the laptop drops off, AutoDJ carries on with your music until you are back.",
  },
  {
    q: "Can people hear last Sunday’s sermon later?",
    a: (
      <>
        GoCast is live radio, not a podcast, so services aren’t recorded for you. On Pro you can upload a recording
        of the sermon and schedule it to play again, for example on Wednesday evening.{" "}
        <Link href="/help/schedule-playlists-by-time">Scheduling playlists by time</Link>.
      </>
    ),
    text: "GoCast is live radio, not a podcast, so services aren't recorded for you. On Pro you can upload a recording of the sermon and schedule it to play again, for example on Wednesday evening.",
  },
  {
    q: "Can we play worship songs on our station?",
    a: (
      <>
        You can, but the licence is yours to hold. Most worship songs are under copyright, and streaming them needs
        a licence that covers where your listeners are. Many churches use a streaming licence such as CCLI’s, where it
        is available. GoCast hosts your station; it doesn’t license the music you play.
      </>
    ),
    text: "You can, but the licence is yours to hold. Most worship songs are under copyright, and streaming them needs a licence that covers where your listeners are. Many churches use a streaming licence such as CCLI's, where it is available. GoCast hosts your station; it doesn't license the music you play.",
  },
  {
    q: "Can we put the player on our church website?",
    a: (
      <>
        Yes, on Pro. Copy the embed snippet from your dashboard into any page of your site and the live player
        appears there. <Link href="/help/embed-the-player">How to embed the player</Link>.
      </>
    ),
    text: "Yes, on Pro. Copy the embed snippet from your dashboard into any page of your site and the live player appears there.",
  },
]

export default function ChurchesPage() {
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
          { "@type": "ListItem", position: 2, name: "For churches", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero: the pitch on the left, what a member sees on the right. */}
      <section>
        <div className="mx-auto grid w-full max-w-page grid-cols-[minmax(0,1fr)] items-center gap-12 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="flex flex-col gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For churches</span>
            </nav>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              Your church service, live on your own radio station.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Stream the service from the laptop at the sound desk. The housebound, the sick and members far away tap
              one link and hear it as it happens, with no app to install. Free for live services.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your church station
                </Link>
              </Button>
              <Link href="#sunday" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                See a Sunday on GoCast →
              </Link>
            </div>
            {/* TrustCues centres itself (it was made for centred CTAs); the hero is left-aligned. */}
            <TrustCues className="justify-start!" />
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end">
            <ChurchPlayerDemo />
          </div>
        </div>
      </section>

      <Section id="sunday">
        <SectionIntro
          split
          eyebrow="A Sunday on GoCast"
          title="Live for the service. Worship music the rest of the week."
          lead="Grace Chapel goes live twice on a Sunday, from the sound desk in the morning and the pastor’s laptop in the evening. Between services, and all week, the station plays its own worship music."
        />
        <SundayRunSheet />
      </Section>

      <Section id="setup">
        <SectionIntro
          eyebrow="Setting it up"
          title="Use the sound you already have."
          lead="If your church already runs a sound desk, you have everything you need. The desk feeds the laptop, the laptop goes live from the browser, and anyone with the link can listen."
        />
        <SetupChain />
      </Section>

      <Section id="features">
        <SectionIntro eyebrow="What churches use" title="Built for the people who can’t be in the room." lead="Four things churches on GoCast lean on. Two are free on every station; two come with Pro." />
        <ul role="list" className="grid gap-3 sm:grid-cols-2 lg:gap-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col gap-4 rounded-card bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-item bg-surface-raised text-foreground">
                  <f.icon size={22} aria-hidden />
                </span>
                {f.pro ? <ProTag /> : <Tag variant="ok">Free</Tag>}
              </div>
              <h3 className="font-display text-card-title">{f.title}</h3>
              <p className="text-body text-muted-foreground text-pretty">{f.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Questions churches ask" title="Before your first Sunday." lead="The questions we hear most from churches setting up a station." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">This Sunday, on air.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your church’s station in under a minute and go live from the sound desk. Free for live services.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your church station
            </Link>
          </Button>
          <TrustCues />
        </div>
      </section>
    </>
  )
}
