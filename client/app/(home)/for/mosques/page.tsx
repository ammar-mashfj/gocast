import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { DayRibbon } from "@/components/use-cases/mosques/DayRibbon"
import { MosqueOnAirDemo } from "@/components/use-cases/mosques/MosqueOnAirDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/mosques — the tenth audience page (docs/USE-CASE-PAGES-PLAN.md): live
 * khutbah and lessons, Quran recitation between them. English first; the
 * plan names it a candidate for an Arabic version.
 *
 * Its own shape: a bilingual hero demo, a 24-hour sky ribbon as the
 * centrepiece, a "for those who can't come" list and a Ramadan band.
 *
 * Checked 2026-11-23: live from a browser is Free with no hour limit (the
 * Free idle check is off on prod — never mention it), so a long taraweeh is
 * fine while the tab stays open; AutoDJ recitation and the weekly schedule
 * are Pro; slots repeat WEEKLY, so the adhan cannot follow daily prayer
 * times — the FAQ says so (logged as a product gap); Arabic names and titles
 * render in the marketing surface's Arabic font, the dashboard is English.
 * Recitation recordings can be copyrighted, so the page points to the imam's
 * own recordings or ones the mosque has permission for.
 */

const PATH = "/for/mosques"
const TITLE = "Mosque Radio: Stream the Khutbah and Quran Live"
const DESCRIPTION =
  "Stream the Friday khutbah, lessons and taraweeh live from your mosque, free. With Pro, Quran recitation plays between them. Listeners tap one link, no app."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const FOR_WHO = [
  { who: "The elderly and the sick", how: "who can’t make it to the mosque, but can hear the khutbah at home as it’s given." },
  { who: "Sisters at home with children", how: "who want the weekly lesson without missing it." },
  { who: "Workers and travellers", how: "listening from a shift, a car or another city." },
  { who: "Families who moved away", how: "who still hear their home mosque, from another city or another country." },
]

const FAQS: Faq[] = [
  {
    q: "Can the station play the adhan at each prayer time?",
    a: (
      <>
        Not by itself. Prayer times change every day, and GoCast’s schedule repeats each week, so it can’t follow them.
        Most mosques go live for the adhan from the mosque’s own sound system, the same way as the khutbah.
      </>
    ),
    text: "Not by itself. Prayer times change every day, and GoCast's schedule repeats each week, so it can't follow them. Most mosques go live for the adhan from the mosque's own sound system, the same way as the khutbah.",
  },
  {
    q: "Can we play Quran recitation all day?",
    a: (
      <>
        Yes, on Pro. Upload recitations to your library and AutoDJ plays them whenever nobody is live, in order or
        shuffled, on a weekly schedule if you want one. Recordings belong to whoever made them, so use your imam’s own
        recitations or ones you have permission to stream. <Link href="/help/upload-your-music">Uploading audio</Link>.
      </>
    ),
    text: "Yes, on Pro. Upload recitations to your library and AutoDJ plays them whenever nobody is live, in order or shuffled, on a weekly schedule if you want one. Recordings belong to whoever made them, so use your imam's own recitations or ones you have permission to stream.",
  },
  {
    q: "Can we stream from the mosque’s sound system?",
    a: (
      <>
        Yes. Connect the sound system’s output to a laptop, usually through a small USB audio interface, and choose it as
        the input in the GoCast studio. Listeners hear the minbar microphone exactly as the mosque does.{" "}
        <Link href="/help/go-live-from-your-browser">Going live from your browser</Link>.
      </>
    ),
    text: "Yes. Connect the sound system's output to a laptop, usually through a small USB audio interface, and choose it as the input in the GoCast studio. Listeners hear the minbar microphone exactly as the mosque does.",
  },
  {
    q: "Will a long taraweeh be cut off?",
    a: (
      <>
        No. A live broadcast runs as long as the GoCast tab stays open on the laptop, with no time limit, on Free too. Keep
        the laptop plugged in and stop it from going to sleep.
      </>
    ),
    text: "No. A live broadcast runs as long as the GoCast tab stays open on the laptop, with no time limit, on Free too. Keep the laptop plugged in and stop it from going to sleep.",
  },
  {
    q: "Can the station name and titles be in Arabic?",
    a: (
      <>
        Yes. The station’s name, description and the titles on the player can be in Arabic, or any language, and that’s
        what listeners see. The dashboard you run the station from is in English for now.
      </>
    ),
    text: "Yes. The station's name, description and the titles on the player can be in Arabic, or any language, and that's what listeners see. The dashboard you run the station from is in English for now.",
  },
  {
    q: "Is it free?",
    a: (
      <>
        Live is free: the khutbah, lessons and taraweeh from any browser, to up to 100 listeners at once, with no card.
        The station is on air while you’re live. Pro adds recitation between live times, a weekly schedule, the player on
        your mosque’s website and up to 1,000 listeners. <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Live is free: the khutbah, lessons and taraweeh from any browser, to up to 100 listeners at once, with no card. The station is on air while you're live. Pro adds recitation between live times, a weekly schedule, the player on your mosque's website and up to 1,000 listeners.",
  },
]

export default function MosquesPage() {
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
          { "@type": "ListItem", position: 2, name: "For mosques", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero, mirrored like the news page: the station on the left. */}
      <section>
        <div className="mx-auto grid w-full max-w-page grid-cols-[minmax(0,1fr)] items-center gap-12 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="flex min-w-0 flex-col gap-6 lg:order-2">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For mosques</span>
            </nav>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              The khutbah, heard in every home.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Stream the Friday khutbah, lessons and taraweeh live from your mosque’s sound system. Between them, your
              station can play Quran recitation. Listeners tap one link on any phone. Free to go live.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your mosque’s station
                </Link>
              </Button>
              <Link href="#friday" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                See a Friday →
              </Link>
            </div>
            <TrustCues className="justify-start!" />
          </div>
          <div className="flex min-w-0 justify-center lg:order-1">
            <MosqueOnAirDemo />
          </div>
        </div>
      </section>

      <Section id="friday">
        <SectionIntro
          split
          eyebrow="A Friday at Al-Noor"
          title="Live when the imam speaks. Recitation in between."
          lead="The mosque goes live after Fajr, for Jumu’ah and for the lesson after Isha. The rest of the day, the station plays recitation from its own library, so there’s always something to come back to."
        />
        <DayRibbon />
        <div className="flex flex-wrap items-center gap-2.5 text-body-sm text-muted-foreground">
          <Tag variant="ok">Free</Tag> the live moments
          <span className="px-1 text-text-faint">·</span>
          <ProTag /> the recitation between them
        </div>
      </Section>

      <Section id="who">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-text-faint">For those who can’t come</span>
            <h2 className="font-display text-section text-balance">The mosque, wherever your community is.</h2>
          </div>
          <ul role="list" className="flex flex-col divide-y divide-line border-y border-line">
            {FOR_WHO.map((f) => (
              <li key={f.who} className="py-5 text-section-lead text-pretty">
                <span className="font-semibold text-foreground">{f.who}</span>{" "}
                <span className="text-muted-foreground">{f.how}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="ramadan" tone="card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="eyebrow text-text-faint">Ramadan</span>
              <Tag variant="ok">Free</Tag>
            </div>
            <h2 className="font-display text-section text-balance">Taraweeh, every night of the month.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              Go live each night from the mosque and stay live for as long as the prayer lasts. There’s no time limit on a
              live broadcast, on Free too. Keep the laptop plugged in and the tab open.
            </p>
            <p>Share the link before the month begins, so families know where to listen from the first night.</p>
          </div>
        </div>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Questions from mosques" title="Before the first Jumu’ah." lead="What mosques ask us before they go on air." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">This Friday, in every home.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your mosque’s station in under a minute and go live from the sound system. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your mosque’s station
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
