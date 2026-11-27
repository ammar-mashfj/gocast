import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { CatalogueDemo } from "@/components/use-cases/musicians/CatalogueDemo"
import {
  CataloguePlaylistsPicture,
  CountriesPicture,
  PremiereQueuePicture,
} from "@/components/use-cases/musicians/MusicianPictures"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { cn } from "@/lib/utils"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/musicians — the fourth audience page (docs/USE-CASE-PAGES-PLAN.md):
 * artists and small labels running a station of their own catalogue.
 *
 * Its own shape: an album-sleeve hero, then three alternating rows (premiere
 * night, the catalogue always on, where listeners are) instead of a single
 * centrepiece, then a rights note.
 *
 * Checked 2026-11-23: uploads read title and artist from the file's tags
 * (TrackImporter CopyTagsToComments, fixed 93a5f4a; ~70% of prod tracks carry
 * an artist) and titles can be edited (PATCH /tracks/{id}); formats MP3, M4A,
 * AAC, FLAC, OGG, WAV, 300 MB a file, 3 GB library; playlists play in order or
 * shuffled (every track once per pass); the studio's "Hold to talk" and file
 * queue are Free. One station per account, so a label's artists are
 * playlists. GoCast keeps no per-track cover art — never imply it. The plan's
 * "no licensing problem" is softened on purpose: a songwriter who signed
 * performing rights to a collecting society may still need its licence.
 */

const PATH = "/for/musicians"
const TITLE = "Radio Station for Musicians and Labels"
const DESCRIPTION =
  "Turn your catalogue into a radio station of your own. Premiere a release live for free, then keep your music on air around the clock with Pro."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const FAQS: Faq[] = [
  {
    q: "Do I need a licence to stream my own music?",
    a: (
      <>
        Not if you wrote and recorded it and still hold the rights. If you’ve signed your recordings to a label, or
        your songs’ performing rights to a collecting society (PRS, ASCAP, BMI, GEMA and others), check what they
        allow: some ask for a licence even when the writer streams their own songs. Covers and other people’s tracks
        need a licence for the countries your listeners are in, and GoCast doesn’t provide one.
      </>
    ),
    text: "Not if you wrote and recorded it and still hold the rights. If you've signed your recordings to a label, or your songs' performing rights to a collecting society (PRS, ASCAP, BMI, GEMA and others), check what they allow: some ask for a licence even when the writer streams their own songs. Covers and other people's tracks need a licence for the countries your listeners are in, and GoCast doesn't provide one.",
  },
  {
    q: "Can I premiere a new release for free?",
    a: (
      <>
        Yes. On Free you go live from your browser, drop the tracks into the studio’s queue and hold to talk between
        them, to up to 100 listeners at once. Listeners can leave their email on your player page beforehand and get a
        message when you go live. <Link href="/help/using-the-studio">Using the studio</Link>.
      </>
    ),
    text: "Yes. On Free you go live from your browser, drop the tracks into the studio's queue and hold to talk between them, to up to 100 listeners at once. Listeners can leave their email on your player page beforehand and get a message when you go live.",
  },
  {
    q: "Will my song titles and artist name show on the player?",
    a: (
      <>
        Yes. When you upload, GoCast reads the title and artist from each file’s tags, and you can edit them in your
        library. The player shows the track that’s playing alongside your station’s artwork.{" "}
        <Link href="/help/upload-your-music">Uploading your music</Link>.
      </>
    ),
    text: "Yes. When you upload, GoCast reads the title and artist from each file's tags, and you can edit them in your library. The player shows the track that's playing alongside your station's artwork.",
  },
  {
    q: "How much music can I upload?",
    a: (
      <>
        On Pro, a 3 GB library: about 750 four-minute songs as MP3. MP3, M4A, AAC, FLAC, OGG and WAV all work, up to
        300 MB a file, so full live recordings fit too. Lossless files are bigger, so they fill the library faster.
      </>
    ),
    text: "On Pro, a 3 GB library: about 750 four-minute songs as MP3. MP3, M4A, AAC, FLAC, OGG and WAV all work, up to 300 MB a file, so full live recordings fit too. Lossless files are bigger, so they fill the library faster.",
  },
  {
    q: "Can a label run one station for all its artists?",
    a: (
      <>
        Yes. Give each artist or release a playlist, shuffle some and play others in order, and put them on a weekly
        schedule: a different artist each evening, a new release on repeat at the weekend.{" "}
        <Link href="/help/schedule-playlists-by-time">Scheduling playlists by time</Link>.
      </>
    ),
    text: "Yes. Give each artist or release a playlist, shuffle some and play others in order, and put them on a weekly schedule: a different artist each evening, a new release on repeat at the weekend.",
  },
  {
    q: "Can listeners download my tracks?",
    a: (
      <>
        No. Your player streams the station live, like radio: there is no download button and no track list to pick
        from. Listeners hear what’s on air, in the order your station plays it.
      </>
    ),
    text: "No. Your player streams the station live, like radio: there is no download button and no track list to pick from. Listeners hear what's on air, in the order your station plays it.",
  },
]

const ROWS = [
  {
    id: "premiere",
    eyebrow: "Release night",
    plan: "free" as const,
    title: "Premiere it live, and talk between the tracks.",
    body: "Go live from your browser, queue the new record and hold to talk between songs: the story behind each one, a thank-you, a shout-out to whoever’s listening. Share the link the week before and listeners can ask to be told when you start.",
    picture: <PremiereQueuePicture />,
  },
  {
    id: "catalogue",
    eyebrow: "Every other night",
    plan: "pro" as const,
    title: "Your whole catalogue, on air all the time.",
    body: "Upload albums, singles, demos and live recordings, and AutoDJ plays them when you’re not there. Shuffle a playlist and every track plays once before any repeats; play an album in order on Sunday nights. Go live whenever you like and you take over.",
    picture: <CataloguePlaylistsPicture />,
  },
  {
    id: "listeners",
    eyebrow: "Who’s listening",
    plan: "pro" as const,
    title: "See where your listeners are.",
    body: "Ninety days of listening by day and by country, so you know where your music travels before you plan a tour or a release. The live count and all-time peak are free on every plan.",
    picture: <CountriesPicture />,
  },
]

export default function MusiciansPage() {
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
          { "@type": "ListItem", position: 2, name: "For musicians and labels", item: url },
        ],
      },
      faqJsonLd(FAQS),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero: the pitch, then the sleeve, big. */}
      <section>
        <div className="mx-auto grid w-full max-w-page grid-cols-[minmax(0,1fr)] items-center gap-12 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-20 lg:pt-20 lg:pb-28">
          <div className="flex flex-col gap-6">
            <nav aria-label="Breadcrumb" className="eyebrow text-text-faint">
              <Link href="/" className="text-text-faint no-underline hover:text-foreground">
                GoCast
              </Link>
              <span aria-hidden className="px-2">/</span>
              <span aria-current="page">For musicians &amp; labels</span>
            </nav>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              A radio station that plays only your music.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Premiere a release live from your browser, then let your albums, singles and demos play around the clock.
              One link for fans, no app to install, and your name on every track.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your station free
                </Link>
              </Button>
              <Link href="#premiere" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                See how artists use it →
              </Link>
            </div>
            <TrustCues className="justify-start!" />
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end">
            <CatalogueDemo />
          </div>
        </div>
      </section>

      {/* Three alternating rows: the picture swaps sides each time. */}
      {ROWS.map((r, i) => (
        <Section key={r.id} id={r.id}>
          <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={cn("flex min-w-0 flex-col gap-4", i % 2 === 1 && "lg:order-2")}>
              <div className="flex items-center gap-2.5">
                <span className="eyebrow text-text-faint">{r.eyebrow}</span>
                {r.plan === "pro" ? <ProTag /> : <Tag variant="ok">Free</Tag>}
              </div>
              <h2 className="font-display text-section text-balance">{r.title}</h2>
              <p className="text-section-lead text-muted-foreground text-pretty">{r.body}</p>
            </div>
            <div className={cn("min-w-0", i % 2 === 1 && "lg:order-1")}>{r.picture}</div>
          </div>
        </Section>
      ))}

      <Section id="rights" tone="card">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-text-faint">Your rights</span>
            <h2 className="font-display text-section text-balance">Your music, your call.</h2>
          </div>
          <div className="flex flex-col gap-4 text-section-lead text-muted-foreground text-pretty">
            <p>
              If you wrote it, recorded it and still own it, you can stream it: there’s nothing to license. That’s what
              makes a station of your own catalogue so simple.
            </p>
            <p>
              Signed to a label, or a member of a collecting society? Check what they allow first, since some license
              streaming even when the writer does it. GoCast hosts your station; the rights stay with whoever holds them.
            </p>
          </div>
        </div>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Artist questions" title="Before you upload." lead="What musicians and labels ask us before they start a station." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">Your music, on air tonight.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your station in under a minute and premiere something live from your browser. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your station free
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
