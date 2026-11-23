import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { DepartureBoard } from "@/components/use-cases/diaspora/DepartureBoard"
import { LanguagesDemo } from "@/components/use-cases/diaspora/LanguagesDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/diaspora-radio — the ninth audience page (docs/USE-CASE-PAGES-PLAN.md):
 * community stations abroad, in their own language.
 *
 * Its own shape: a hero cycling five languages, a departure board as the
 * centrepiece (one show, local times in each country), then a "your
 * language, end to end" split that is honest about the English dashboard.
 *
 * Checked 2026-11-23: the player is on the marketing surface, whose font
 * stack falls back to IBM Plex Sans Arabic (dashboard.css), so Arabic-script
 * names render; the dashboard has no translations (English only); slots run
 * in the station's own timezone, which the owner sets (TimezoneDialog);
 * country stats are Pro. No promise of reaching listeners where GoCast is
 * blocked. Never mention the Free idle check (off on prod).
 */

const PATH = "/for/diaspora-radio"
const TITLE = "Diaspora Radio: Your Language, Heard Worldwide"
const DESCRIPTION =
  "Start an online radio station for your community abroad, in your own language. Family back home and abroad tap one link, no app. Free to go live."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const ANY_LANGUAGE = [
  "Your station’s name",
  "Its description and artwork",
  "Every show, every word on air",
  "Track and show titles on the player",
]

const FAQS: Faq[] = [
  {
    q: "Is GoCast in my language?",
    a: (
      <>
        Your station is: its name, description, shows and track titles can be in any language and any script, including
        right-to-left ones like Arabic, and that’s what listeners see. The dashboard you run it from is in English for now.
      </>
    ),
    text: "Your station is: its name, description, shows and track titles can be in any language and any script, including right-to-left ones like Arabic, and that's what listeners see. The dashboard you run it from is in English for now.",
  },
  {
    q: "Do my older relatives need an app?",
    a: (
      <>
        No. Send them the link on WhatsApp or by text, and it opens the player in their phone’s browser. They press play.
        There’s no account to make and nothing to install.
      </>
    ),
    text: "No. Send them the link on WhatsApp or by text, and it opens the player in their phone's browser. They press play. There's no account to make and nothing to install.",
  },
  {
    q: "Can people back home listen?",
    a: (
      <>
        Yes, anywhere GoCast isn’t blocked: your station is on the open web, and on Pro the audience page shows which
        countries your listeners are in. GoCast doesn’t get around blocks or hide who runs a station.
      </>
    ),
    text: "Yes, anywhere GoCast isn't blocked: your station is on the open web, and on Pro the audience page shows which countries your listeners are in. GoCast doesn't get around blocks or hide who runs a station.",
  },
  {
    q: "Which time zone does the schedule use?",
    a: (
      <>
        Your station’s, which you choose: home time, or the city where most of your listeners live. AutoDJ slots start at
        that time in that time zone, daylight saving included (Pro).{" "}
        <Link href="/help/schedule-playlists-by-time">Scheduling by time</Link>.
      </>
    ),
    text: "Your station's, which you choose: home time, or the city where most of your listeners live. AutoDJ slots start at that time in that time zone, daylight saving included (Pro).",
  },
  {
    q: "Can we play music from home?",
    a: (
      <>
        Yes, with a licence that covers it. Streaming other people’s music online usually needs a licence for the
        countries your listeners are in, and GoCast doesn’t provide one. Talk, news, religious programmes, interviews and
        music the artists have cleared need nothing extra.
      </>
    ),
    text: "Yes, with a licence that covers it. Streaming other people's music online usually needs a licence for the countries your listeners are in, and GoCast doesn't provide one. Talk, news, religious programmes, interviews and music the artists have cleared need nothing extra.",
  },
  {
    q: "Is it free?",
    a: (
      <>
        Going live is free: from any browser, for as long as you like, to up to 100 listeners at once, with no card. The
        station is on air while you’re live. Pro adds AutoDJ and a schedule, listeners by country, the player on your
        website and up to 1,000 listeners. <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Going live is free: from any browser, for as long as you like, to up to 100 listeners at once, with no card. The station is on air while you're live. Pro adds AutoDJ and a schedule, listeners by country, the player on your website and up to 1,000 listeners.",
  },
]

export default function DiasporaRadioPage() {
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
          { "@type": "ListItem", position: 2, name: "For diaspora and language radio", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section>
        <div className="mx-auto grid w-full max-w-page grid-cols-[minmax(0,1fr)] items-center gap-12 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="flex min-w-0 flex-col gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For diaspora &amp; language radio</span>
            </nav>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              Radio from home, in your own language, wherever you are.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Start a station for your community abroad: news, music, faith and talk in the language you grew up with.
              Family in five countries tap the same link, with no app to install. Free to go live.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your community’s station
                </Link>
              </Button>
              <Link href="#board" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                One show, six countries →
              </Link>
            </div>
            <TrustCues className="justify-start!" />
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end">
            <LanguagesDemo />
          </div>
        </div>
      </section>

      <Section id="board">
        <SectionIntro
          split
          eyebrow="Wherever home went"
          title="One show, heard in six countries at once."
          lead="A diaspora station is home, sent everywhere your community lives. Go live on Sunday evening in Lagos and it’s Sunday lunchtime in Houston, and every listener hears the same show at the same moment."
        />
        <DepartureBoard />
      </Section>

      <Section id="language">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4">
            <span className="eyebrow text-text-faint">Your language, end to end</span>
            <h2 className="font-display text-section text-balance">Everything listeners see and hear is yours.</h2>
            <p className="text-section-lead text-muted-foreground text-pretty">
              Any language, any script, left to right or right to left. The one part in English is the dashboard you run
              the station from.
            </p>
          </div>
          <ul role="list" className="flex flex-col gap-2">
            {ANY_LANGUAGE.map((x) => (
              <li key={x} className="flex items-center justify-between gap-4 rounded-item bg-card px-5 py-4">
                <span className="text-body font-semibold">{x}</span>
                <Tag variant="ok">Any language</Tag>
              </li>
            ))}
            <li className="flex items-center justify-between gap-4 rounded-item border border-line px-5 py-4">
              <span className="text-body text-muted-foreground">The dashboard</span>
              <Tag>English for now</Tag>
            </li>
          </ul>
        </div>
      </Section>

      <Section id="pro" tone="card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="eyebrow text-text-faint">Between live shows</span>
              <ProTag />
            </div>
            <h2 className="font-display text-section text-balance">On air in every time zone.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              When nobody’s live, AutoDJ plays your library on a weekly schedule set in your station’s time zone: morning
              music when it’s morning at home, the Friday sermon again on Saturday, songs from home all night.
            </p>
            <p>And the audience page shows which countries your listeners are in, so you know where home has gone.</p>
          </div>
        </div>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Community questions" title="Before your first broadcast." lead="What diaspora and language stations ask us before they go on air." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Home, on one link.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your community’s station in under a minute and go live from your browser. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your community’s station
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
