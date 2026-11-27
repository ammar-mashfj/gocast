import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { BrowserInputPicture, EncoderFieldsPicture, MixCrate } from "@/components/use-cases/djs/DjPictures"
import { DjDeckDemo } from "@/components/use-cases/djs/DjDeckDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/djs — the second audience page (docs/USE-CASE-PAGES-PLAN.md).
 *
 * Shaped differently from /for/churches on purpose: a centred hero over a
 * full-width deck, then a two-way split (browser vs DJ software) where the
 * church page has a run-sheet, then the crate of mixes, then a licensing
 * note the plan requires.
 *
 * Checked against the product (2026-11-23): the studio opens its input in
 * stereo with echo cancellation, noise suppression and AGC off
 * (lib/mic.ts), so a mixer goes out clean; listeners get 128 kbps stereo
 * (station.blade.php); the studio and Mixxx both send track titles; the
 * encoder is Pro (harbor auth `canUseEncoder`); uploads take 300 MB per
 * file (StoreTrackRequest). Traktor is deliberately not named: its Icecast
 * output is unverified against our ingest. Never mention the Free idle
 * check — it is off on prod.
 */

const PATH = "/for/djs"
const TITLE = "Online Radio for DJs: Stream Your Live Sets"
const DESCRIPTION =
  "Stream live DJ sets to anyone with a link, from your browser or from Mixxx. Free to go live; Pro replays your mixes when you're off the decks."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const FAQS: Faq[] = [
  {
    q: "Can I stream a DJ set without any broadcasting software?",
    a: (
      <>
        Yes, on Free. Connect your mixer’s record or booth output to your computer, through an audio interface or the
        line-in, then open the GoCast studio in your browser and choose that input. The studio takes it in stereo
        with the voice-call filters switched off, so the music isn’t squashed.{" "}
        <Link href="/help/go-live-from-your-browser">How to go live from your browser</Link>.
      </>
    ),
    text: "Yes, on Free. Connect your mixer's record or booth output to your computer, through an audio interface or the line-in, then open the GoCast studio in your browser and choose that input. The studio takes it in stereo with the voice-call filters switched off, so the music isn't squashed.",
  },
  {
    q: "Does it work with Serato or rekordbox?",
    a: (
      <>
        Neither broadcasts on its own, but you can still stream what they play. Route their output to a virtual audio
        cable, such as BlackHole on a Mac or VB-Cable on Windows, and choose that cable as the input in the GoCast
        studio. Or run your mixer’s output into the computer as above.
      </>
    ),
    text: "Neither broadcasts on its own, but you can still stream what they play. Route their output to a virtual audio cable, such as BlackHole on a Mac or VB-Cable on Windows, and choose that cable as the input in the GoCast studio. Or run your mixer's output into the computer as above.",
  },
  {
    q: "Can I broadcast straight from Mixxx or BUTT?",
    a: (
      <>
        Yes, on Pro. Your station accepts any software that can broadcast to an Icecast server: Mixxx, BUTT, RadioDJ
        and most others. Paste the server, port, mount and password from your Go live page and you’re on air, with Mixxx
        sending each track’s title to your player.{" "}
        <Link href="/help/broadcast-from-butt-or-mixxx">Connecting BUTT or Mixxx</Link>.
      </>
    ),
    text: "Yes, on Pro. Your station accepts any software that can broadcast to an Icecast server: Mixxx, BUTT, RadioDJ and most others. Paste the server, port, mount and password from your Go live page and you're on air, with Mixxx sending each track's title to your player.",
  },
  {
    q: "What sound quality do listeners get?",
    a: (
      <>
        Listeners hear your set in 128 kbps stereo. From the browser studio GoCast checks your upload speed before
        you go live and steps the bitrate down if your connection can’t hold 128 kbps, so the set doesn’t stutter.
      </>
    ),
    text: "Listeners hear your set in 128 kbps stereo. From the browser studio GoCast checks your upload speed before you go live and steps the bitrate down if your connection can't hold 128 kbps, so the set doesn't stutter.",
  },
  {
    q: "Can my station play my old mixes when I’m not live?",
    a: (
      <>
        Yes, on Pro. Upload your recorded sets, up to 300 MB each, and AutoDJ plays them when you’re off the decks.
        Put them on a weekly schedule, so last Friday’s set replays on Sunday evening, and go live at any time to take
        over. <Link href="/help/upload-your-music">Uploading your music</Link>.
      </>
    ),
    text: "Yes, on Pro. Upload your recorded sets, up to 300 MB each, and AutoDJ plays them when you're off the decks. Put them on a weekly schedule, so last Friday's set replays on Sunday evening, and go live at any time to take over.",
  },
  {
    q: "Do I need a licence to stream my DJ sets?",
    a: (
      <>
        Usually, yes, and it’s yours to arrange. Playing other people’s records to an online audience needs licences
        that cover the countries your listeners are in. GoCast hosts your station; it doesn’t license the music you
        play. If you only play your own productions, or music you have permission to stream, you don’t need one.
      </>
    ),
    text: "Usually, yes, and it's yours to arrange. Playing other people's records to an online audience needs licences that cover the countries your listeners are in. GoCast hosts your station; it doesn't license the music you play. If you only play your own productions, or music you have permission to stream, you don't need one.",
  },
  {
    q: "How many people can listen at once?",
    a: (
      <>
        Up to 100 at the same time on Free, and up to 1,000 on Pro. Listeners don’t need an app or an account: your
        link opens the player in any browser. <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Up to 100 at the same time on Free, and up to 1,000 on Pro. Listeners don't need an app or an account: your link opens the player in any browser.",
  },
]

export default function DjsPage() {
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
          { "@type": "ListItem", position: 2, name: "For DJs", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero: centred, with the deck running the full measure under it. */}
      <section>
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-10 px-gutter pt-10 pb-14 text-center sm:pt-16 sm:pb-20 lg:gap-14 lg:pt-20 lg:pb-24">
          <div className="flex flex-col items-center gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For DJs</span>
            </nav>
            <h1 className="max-w-[14em] font-display text-marquee text-balance">Your DJ set, live on your own station.</h1>
            <p className="max-w-[36em] text-standfirst text-muted-foreground text-pretty">
              Plug your mixer into your laptop and go live from the browser, or connect Mixxx. Listeners tap one link
              and hear the set as you play it, with each track’s name on the player.
            </p>
            <div className="flex w-full flex-col items-center gap-4">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your DJ station free
                </Link>
              </Button>
              <TrustCues />
            </div>
          </div>
          <DjDeckDemo />
        </div>
      </section>

      <Section id="two-ways">
        <SectionIntro
          split
          eyebrow="Two ways on air"
          title="From the browser, or from your DJ software."
          lead="Start with the gear on your desk and a browser tab. When you want your own software in charge, connect it straight to your station."
        />
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          <article className="flex flex-col gap-5 rounded-card bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow text-text-faint">Way 01</span>
              <Tag variant="ok">Free</Tag>
            </div>
            <BrowserInputPicture />
            <h3 className="font-display text-card-title">Your mixer, into the browser</h3>
            <p className="text-body text-muted-foreground text-pretty">
              Run the mixer’s record out into your computer and pick it as the input in the GoCast studio. No
              encoder to configure. Talk over the mix on the same input, or queue a few files for the gaps.
            </p>
          </article>
          <article className="flex flex-col gap-5 rounded-card bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow text-text-faint">Way 02</span>
              <ProTag />
            </div>
            <EncoderFieldsPicture />
            <h3 className="font-display text-card-title">Mixxx, BUTT or any Icecast encoder</h3>
            <p className="text-body text-muted-foreground text-pretty">
              Paste three values from your Go live page and your software broadcasts directly to your station, with
              track titles updating on the player as you mix.
            </p>
          </article>
        </div>
      </Section>

      <Section id="mixes">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2.5">
              <span className="eyebrow text-text-faint">Between sets</span>
              <ProTag />
            </div>
            <h2 className="font-display text-section text-balance">Your mixes keep playing when you stop.</h2>
            <p className="text-section-lead text-muted-foreground text-pretty">
              Upload your recorded sets and AutoDJ plays them whenever you’re not live. Give each one a weekly slot,
              so the Friday set replays on Sunday. Go live and you take over; stop and the crate picks back up.
            </p>
            <Link href="/help/schedule-playlists-by-time" className="text-body font-semibold text-foreground">
              How scheduling works →
            </Link>
          </div>
          <MixCrate />
        </div>
      </Section>

      <Section id="licensing" tone="card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-text-faint">The honest part</span>
            <h2 className="font-display text-section text-balance">About the music you play.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              GoCast hosts your station. It doesn’t license the music on it. Playing other people’s records to an
              online audience usually needs a licence covering the countries your listeners are in, and arranging it
              is up to you.
            </p>
            <p>
              Playing your own productions, or tracks the artist has cleared for streaming? Then there’s nothing to
              arrange.
            </p>
          </div>
        </div>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="DJ questions" title="Before your first set." lead="What DJs ask us before they go live for the first time." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Drop the first track tonight.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your station in under a minute and go live from your browser. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your DJ station free
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
