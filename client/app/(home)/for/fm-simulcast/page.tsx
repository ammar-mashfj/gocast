import type { Metadata } from "next"
import Link from "next/link"
import { IconBroadcast, IconChartBar, IconCode, IconLink, IconUsers } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { ProTag } from "@/components/ds/Tag"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { SignalChain } from "@/components/use-cases/fm/SignalChain"
import { SimulcastMonitorDemo } from "@/components/use-cases/fm/SimulcastMonitorDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/fm-simulcast — the sixth audience page (docs/USE-CASE-PAGES-PLAN.md):
 * FM and AM stations putting their broadcast online. The only Pro-first page:
 * encoder ingest is Pro (harbor auth `canUseEncoder`, StreamKeyController), so
 * the hero says so and the CTA is Get Pro (sign-up, as the pricing card's Pro
 * button does; checkout needs an account).
 *
 * Its own shape: a Pro notice inside the hero, a signal-chain diagram as the
 * centrepiece, and a backup section.
 *
 * Checked 2026-11-23: the station speaks the Icecast 2 source protocol
 * (help: BUTT, Mixxx, RadioDJ, Audio Hijack, SAM, ffmpeg); output is 128 kbps
 * (AAC over HLS on the player, MP3 on the Icecast URL); listeners run ~15–20s behind; the station's source order is live > AutoDJ > silence
 * (station.blade.php `fallback`), so a dropped encoder falls to AutoDJ when
 * the library has music; public stream URL, embed, 1,000 listeners and
 * 90-day country stats are Pro; Custom is "Unlimited listeners". Shoutcast
 * and hardware encoders are NOT claimed (unverified). No latency figure is
 * given: it isn't measured for this path.
 */

const PATH = "/for/fm-simulcast"
const TITLE = "Stream Your FM Station Online, with a Backup"
const DESCRIPTION =
  "Put your FM or AM station online: connect your encoder, get a player page, a stream URL for TuneIn and Sonos, and AutoDJ as backup if the feed drops. Pro."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const FEATURES = [
  { icon: IconLink, title: "A stream URL of your own", body: "A public Icecast URL for TuneIn, Sonos, VLC and the radio directories that take one." },
  { icon: IconCode, title: "The player on your website", body: "Embed the live player on your station’s site with one copied snippet." },
  { icon: IconUsers, title: "1,000 listeners at once", body: "Room for a busy morning show. Need more? Our Custom plan has no listener cap." },
  { icon: IconChartBar, title: "Listeners by country", body: "Ninety days of online listening by day and country, next to the live count and all-time peak." },
  { icon: IconBroadcast, title: "Now playing, from your playout", body: "If your encoder sends track titles, they appear on your player as each one starts." },
]

const FAQS: Faq[] = [
  {
    q: "Which encoders work?",
    a: (
      <>
        Anything that can stream to an Icecast 2 server: BUTT, RadioDJ, SAM Broadcaster, Mixxx, Audio Hijack, ffmpeg and
        most others. Paste the server, port, mount and password from your Go live page.{" "}
        <Link href="/help/broadcast-from-butt-or-mixxx">Connecting your encoder</Link>.
      </>
    ),
    text: "Anything that can stream to an Icecast 2 server: BUTT, RadioDJ, SAM Broadcaster, Mixxx, Audio Hijack, ffmpeg and most others. Paste the server, port, mount and password from your Go live page.",
  },
  {
    q: "What happens if our encoder or internet drops?",
    a: (
      <>
        Your station switches to AutoDJ and plays from your library, so online listeners hear music instead of silence.
        When the encoder reconnects, the FM feed takes over again by itself. Upload a playlist of station idents and
        music you’re licensed to stream so the backup sounds like you.
      </>
    ),
    text: "Your station switches to AutoDJ and plays from your library, so online listeners hear music instead of silence. When the encoder reconnects, the FM feed takes over again by itself. Upload a playlist of station idents and music you're licensed to stream so the backup sounds like you.",
  },
  {
    q: "Can we stream 24 hours a day?",
    a: (
      <>
        Yes. Leave the encoder connected and the station carries your programme around the clock. There’s no limit on
        hours and no bandwidth bill.
      </>
    ),
    text: "Yes. Leave the encoder connected and the station carries your programme around the clock. There's no limit on hours and no bandwidth bill.",
  },
  {
    q: "Does our FM licence cover streaming online?",
    a: (
      <>
        Often not. In many countries the music licences for broadcasting and for streaming are separate, and online
        listeners can be anywhere. Check with your licensing bodies before you simulcast. GoCast hosts your stream; it
        doesn’t license the music on it.
      </>
    ),
    text: "Often not. In many countries the music licences for broadcasting and for streaming are separate, and online listeners can be anywhere. Check with your licensing bodies before you simulcast. GoCast hosts your stream; it doesn't license the music on it.",
  },
  {
    q: "Will online listeners hear exactly what's on FM?",
    a: (
      <>
        Yes, the same programme, about 15 to 20 seconds behind the radio, as with most online streams. Listeners get
        128 kbps stereo in any browser, with no app to install.
      </>
    ),
    text: "Yes, the same programme, about 15 to 20 seconds behind the radio, as with most online streams. Listeners get 128 kbps stereo in any browser, with no app to install.",
  },
  {
    q: "Can we try it before paying?",
    a: (
      <>
        Connecting an encoder is part of Pro. On Free you can still put the station online from a browser: run the desk’s
        output into a computer, choose it as the input in the GoCast studio and keep the tab open. It’s a fair test of how
        your audience finds you before you move to an encoder. <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Connecting an encoder is part of Pro. On Free you can still put the station online from a browser: run the desk's output into a computer, choose it as the input in the GoCast studio and keep the tab open. It's a fair test of how your audience finds you before you move to an encoder.",
  },
]

export default function FmSimulcastPage() {
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
          { "@type": "ListItem", position: 2, name: "For FM stations", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section>
        <div className="mx-auto grid w-full max-w-page grid-cols-[minmax(0,1fr)] items-center gap-12 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="flex min-w-0 flex-col gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For FM stations</span>
            </nav>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              Your FM station, online, with a backup.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Connect the encoder you already have and your programme reaches listeners beyond the transmitter: a player
              page, your website, TuneIn and Sonos. If the feed drops, AutoDJ keeps the stream going until it’s back.
            </p>
            {/* Said up front, as the plan requires: this page is a Pro page. */}
            <div className="flex max-w-[34em] items-start gap-3 rounded-item bg-card p-4">
              <ProTag className="mt-0.5" />
              <p className="text-body-sm text-muted-foreground text-pretty">
                Connecting an encoder is a <span className="font-semibold text-foreground">Pro</span> feature, and so is
                everything on this page except the player page.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Get Pro
                </Link>
              </Button>
              <Link href="/#pricing" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                See pricing →
              </Link>
            </div>
          </div>
          {/* min-w-0: a grid item is otherwise as wide as its content, and the
              monitor's rows would push the page past a phone's width. */}
          <div className="flex min-w-0 justify-center lg:justify-end">
            <SimulcastMonitorDemo />
          </div>
        </div>
      </section>

      <Section id="chain">
        <SectionIntro
          split
          eyebrow="The signal chain"
          title="One more output from the desk you already run."
          lead="Your studio keeps feeding the transmitter. A second feed goes from your encoder to GoCast, which turns it into a stream every listener can reach."
        />
        <SignalChain />
      </Section>

      <Section id="backup" tone="card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-text-faint">When the feed drops</span>
            <h2 className="font-display text-section text-balance">Your stream doesn’t go silent.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              Encoders crash and studio internet drops. When your feed stops, the station switches to AutoDJ and plays from
              your library: idents, a promo, music you’re licensed for. Online listeners hear the station, not dead air.
            </p>
            <p>When the encoder reconnects, the FM feed takes over again by itself. Nobody has to press anything.</p>
          </div>
        </div>
      </Section>

      <Section id="features">
        <SectionIntro eyebrow="What comes with it" title="Everything a station expects online." lead="All of it part of Pro." />
        <ul role="list" className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col gap-3 border-t border-line pt-5">
              <f.icon size={24} aria-hidden className="text-foreground" />
              <h3 className="font-display text-heading">{f.title}</h3>
              <p className="text-body text-muted-foreground text-pretty">{f.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Station questions" title="Before you connect." lead="What FM and AM stations ask us before they simulcast." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Beyond the transmitter.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your station, move to Pro and connect your encoder. Your listeners get one link that works anywhere.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Get Pro
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
