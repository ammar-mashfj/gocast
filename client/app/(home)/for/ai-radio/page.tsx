import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { AiStationDemo } from "@/components/use-cases/ai/AiStationDemo"
import { ShuffleDeck } from "@/components/use-cases/ai/ShuffleDeck"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/ai-radio — the eighth audience page (docs/USE-CASE-PAGES-PLAN.md):
 * stations of AI-made music or shows, running 24/7 on AutoDJ.
 *
 * Its own shape: a levelling demo in the hero, the shuffle deck as the
 * centrepiece, and three numbered steps from generator to listener.
 *
 * Checked 2026-11-23: shuffle plays every track once per pass and the new
 * deck never opens on the track that just played (AutoDjScheduler::deal,
 * $avoidHead); uploads are measured (EBU R128) and levelled to -14 LUFS when
 * LIQUIDSOAP_APPLY_AMPLIFY is on — the default; prod's value NOT confirmed
 * (no access to prod env), so check it before shipping; 300 MB a file, 3 GB
 * library; Terms §4 forbid impersonating a person, so no cloned voices of
 * real people. There is no public upload API (logged as a product gap). The
 * page never names AI generators or states their terms: those change.
 */

const PATH = "/for/ai-radio"
const TITLE = "Start an AI Radio Station: AI Music On Air 24/7"
const DESCRIPTION =
  "Turn your AI-generated music or shows into a radio station that plays around the clock. Every track levelled to the same loudness, no repeats until all have played."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const STEPS = [
  {
    n: "01",
    title: "Make the music",
    body: "Generate tracks, mixes or spoken shows in the AI tool you already use, and export them as audio files.",
  },
  {
    n: "02",
    title: "Drop them in",
    body: "Select or drag in dozens of files at once: MP3, WAV, FLAC and more, up to 300 MB a file. Titles come from each file’s tags.",
  },
  {
    n: "03",
    title: "Leave it on",
    body: "AutoDJ plays the library day and night, shuffled or in order, on a weekly schedule if you want one. One link for listeners.",
  },
]

const FAQS: Faq[] = [
  {
    q: "Am I allowed to stream AI-generated music?",
    a: (
      <>
        That depends on the tool that made it. Many AI music generators only grant commercial or streaming rights on
        their paid plans, and their terms change, so check what yours allows for the tracks you upload. GoCast hosts your
        station; it doesn’t license the music on it.
      </>
    ),
    text: "That depends on the tool that made it. Many AI music generators only grant commercial or streaming rights on their paid plans, and their terms change, so check what yours allows for the tracks you upload. GoCast hosts your station; it doesn't license the music on it.",
  },
  {
    q: "My AI tracks are all at different volumes. Does that matter?",
    a: (
      <>
        No. GoCast measures every track’s loudness when you upload it and plays each one at the station’s level, so
        listeners don’t reach for the volume between songs. It’s one fixed adjustment per track, not compression, so
        nothing pumps or breathes.
      </>
    ),
    text: "No. GoCast measures every track's loudness when you upload it and plays each one at the station's level, so listeners don't reach for the volume between songs. It's one fixed adjustment per track, not compression, so nothing pumps or breathes.",
  },
  {
    q: "Will listeners hear the same track twice in a row?",
    a: (
      <>
        No. A shuffled playlist plays every track once before any repeats, and when it starts over, the first track is
        never the one that just played. <Link href="/help/playlists-and-the-rotation">Playlists and the rotation</Link>.
      </>
    ),
    text: "No. A shuffled playlist plays every track once before any repeats, and when it starts over, the first track is never the one that just played.",
  },
  {
    q: "Can I use an AI voice for presenters or news?",
    a: (
      <>
        Yes, as long as it isn’t a copy of a real person’s voice. Our terms don’t allow impersonating another person, so
        use original or licensed synthetic voices. Telling listeners the station is AI-made, in its description, is good
        practice.
      </>
    ),
    text: "Yes, as long as it isn't a copy of a real person's voice. Our terms don't allow impersonating another person, so use original or licensed synthetic voices. Telling listeners the station is AI-made, in its description, is good practice.",
  },
  {
    q: "How many tracks can I upload?",
    a: (
      <>
        On Pro, a 3 GB library: about 750 four-minute MP3s. Up to 300 MB a file, so hour-long generated mixes fit too.{" "}
        <Link href="/help/upload-your-music">Uploading your music</Link>.
      </>
    ),
    text: "On Pro, a 3 GB library: about 750 four-minute MP3s. Up to 300 MB a file, so hour-long generated mixes fit too.",
  },
  {
    q: "Can I run an AI station on the free plan?",
    a: (
      <>
        Only while you’re there: on Free, the station plays what you queue in the browser studio and goes quiet when you
        close the tab. A station that plays on its own, around the clock, is what Pro’s AutoDJ is for.{" "}
        <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Only while you're there: on Free, the station plays what you queue in the browser studio and goes quiet when you close the tab. A station that plays on its own, around the clock, is what Pro's AutoDJ is for.",
  },
]

export default function AiRadioPage() {
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
          { "@type": "ListItem", position: 2, name: "For AI-generated stations", item: url },
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
              <span aria-current="page">For AI-generated stations</span>
            </nav>
            <div className="flex items-center gap-2.5">
              <ProTag />
              <span className="eyebrow text-text-faint">24/7 needs AutoDJ</span>
            </div>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              Your AI music, on air around the clock.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Generate the tracks, upload them in one go, and your station plays them day and night. Every track at the same
              loudness, and no repeats until the whole library has played.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your AI station
                </Link>
              </Button>
              <Link href="#deck" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                How the shuffle works →
              </Link>
            </div>
            <TrustCues className="justify-start!" />
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end">
            <AiStationDemo />
          </div>
        </div>
      </section>

      <Section id="deck">
        <SectionIntro
          split
          eyebrow="The shuffle"
          title="Hundreds of tracks, and none twice until all have played."
          lead="AI makes libraries big, and a big library on a bad shuffle still repeats. AutoDJ deals the playlist like a deck of cards: every track once per pass, then a fresh shuffle."
        />
        <ShuffleDeck />
      </Section>

      <Section id="steps">
        <SectionIntro eyebrow="From generator to listener" title="Three steps, then leave it on." lead="No server, no streaming software, no playlist scripts." />
        <ol role="list" className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-4 rounded-card border border-line p-6">
              <span className="font-display text-[3.5rem] leading-none font-extrabold tracking-[-0.04em] text-on-air-text">{s.n}</span>
              <h3 className="font-display text-card-title">{s.title}</h3>
              <p className="text-body text-muted-foreground text-pretty">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="rights" tone="card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="eyebrow text-text-faint">The rights</span>
              <Tag>Read this</Tag>
            </div>
            <h2 className="font-display text-section text-balance">Made by AI still means someone’s terms.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              Whether you can stream a generated track is set by the tool that made it, and many only allow it on a paid
              plan. Check before you upload. GoCast hosts your station; it doesn’t license what’s on it.
            </p>
            <p>And no cloned voices of real people: our terms don’t allow impersonating anyone.</p>
          </div>
        </div>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="AI station questions" title="Before you go 24/7." lead="What people running AI stations ask us first." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Always on. Never the same twice.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your station in under a minute, upload your tracks with Pro, and leave it playing.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your AI station
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
