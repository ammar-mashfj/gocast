import type { Metadata } from "next"
import Link from "next/link"
import { IconCheck, IconChartBar, IconMicrophone, IconNews, IconCalendarEvent } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { ProTag, Tag } from "@/components/ds/Tag"
import { TrustCues } from "@/components/common/TrustCues"
import { Section, SectionIntro } from "@/components/homepage/Section"
import { RundownDemo } from "@/components/use-cases/student/RundownDemo"
import { UseCaseFaq, faqJsonLd, type Faq } from "@/components/use-cases/UseCaseFaq"
import { env } from "@/lib/env"
import { pageMetadata } from "@/lib/seo"

/**
 * /for/student-radio — the seventh audience page (docs/USE-CASE-PAGES-PLAN.md):
 * school and university stations, student news included.
 *
 * Its own shape: a running-order hero, a skills grid (what students learn —
 * the teacher's reason to say yes), a "before students go on air" checklist,
 * and a Free/Pro table instead of tagged cards.
 *
 * Checked 2026-11-23 against the Terms: users must be 13 or older (§3), and
 * every station is public with no private or unlisted mode, and may be
 * listed in the directory and featured (§4). Both are stated plainly, with a
 * teacher holding the account. One login per station (no presenter
 * accounts). The school-network answer only promises what the studio does:
 * it checks the connection before going live. Never mention the Free idle
 * check (off on prod).
 */

const PATH = "/for/student-radio"
const TITLE = "School and University Radio Station, Free to Start"
const DESCRIPTION =
  "Start a school or student radio station that runs in a browser: lunchtime shows, campus news and interviews, with one link for the whole school. Free to start."

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH })

const SKILLS = [
  { icon: IconMicrophone, title: "Presenting", body: "Speaking clearly to an audience they can’t see, with a clock running." },
  { icon: IconNews, title: "Reporting", body: "Finding a story on campus, checking it and reading it as a bulletin." },
  { icon: IconCalendarEvent, title: "Producing", body: "Writing a running order, keeping time and handing over between presenters." },
  { icon: IconChartBar, title: "Knowing the audience", body: "Watching the live listener count, and on Pro, where listeners are from." },
]

const CHECKLIST = [
  "A teacher or staff member holds the account. Everyone on GoCast must be 13 or older.",
  "The station is public: anyone with the link can listen, and it can appear in GoCast’s station listings.",
  "Use first names on air, and leave out timetables, home towns and anything that locates a student.",
  "Share the login only with the students you supervise, and change the password at the end of the year.",
]

const PLANS: { what: string; free: boolean; pro: boolean }[] = [
  { what: "Live shows from any browser", free: true, pro: true },
  { what: "Mic, files and talk-over in the studio", free: true, pro: true },
  { what: "One link that opens on any phone", free: true, pro: true },
  { what: "Listeners at once", free: true, pro: true },
  { what: "Music and recorded shows when nobody’s live", free: false, pro: true },
  { what: "A weekly schedule of student shows", free: false, pro: true },
  { what: "The player on the school website", free: false, pro: true },
  { what: "Listener history by country", free: false, pro: true },
]

const FAQS: Faq[] = [
  {
    q: "Can students run the station themselves?",
    a: (
      <>
        Students aged 13 and over can present, produce and run the studio. We recommend that a teacher or staff member
        holds the account, signs students in and is around while they’re live, especially in a school with younger
        pupils. A station has one login, so whoever holds it is responsible for what goes out.
      </>
    ),
    text: "Students aged 13 and over can present, produce and run the studio. We recommend that a teacher or staff member holds the account, signs students in and is around while they're live, especially in a school with younger pupils. A station has one login, so whoever holds it is responsible for what goes out.",
  },
  {
    q: "Can we keep the station private to the school?",
    a: (
      <>
        No. Every GoCast station is public: anyone with the link can listen, and stations can appear in our public
        listings. Plan your shows as you would anything the school publishes online, and keep personal details about
        students off air.
      </>
    ),
    text: "No. Every GoCast station is public: anyone with the link can listen, and stations can appear in our public listings. Plan your shows as you would anything the school publishes online, and keep personal details about students off air.",
  },
  {
    q: "What equipment do we need?",
    a: (
      <>
        A laptop with a browser and a microphone. A USB microphone sounds much better than the laptop’s own, and a small
        mixer lets two presenters and a guest share the show. Choose the mic or mixer as the input in the GoCast studio.{" "}
        <Link href="/help/go-live-from-your-browser">Going live from your browser</Link>.
      </>
    ),
    text: "A laptop with a browser and a microphone. A USB microphone sounds much better than the laptop's own, and a small mixer lets two presenters and a guest share the show. Choose the mic or mixer as the input in the GoCast studio.",
  },
  {
    q: "Will it work on the school network?",
    a: (
      <>
        Usually. The studio checks your connection before you go live and picks a bitrate the network can hold. If the
        check fails on the school network but works at home, ask your IT team to allow GoCast.
      </>
    ),
    text: "Usually. The studio checks your connection before you go live and picks a bitrate the network can hold. If the check fails on the school network but works at home, ask your IT team to allow GoCast.",
  },
  {
    q: "Can students play music on the station?",
    a: (
      <>
        Only music you’re licensed to stream. A school’s music licence usually covers playing music in school, not
        streaming it online, and GoCast doesn’t provide one. Talk, news, interviews and music students made themselves are
        all fine.
      </>
    ),
    text: "Only music you're licensed to stream. A school's music licence usually covers playing music in school, not streaming it online, and GoCast doesn't provide one. Talk, news, interviews and music students made themselves are all fine.",
  },
  {
    q: "Is it free?",
    a: (
      <>
        Live shows are free: from any browser, for as long as you like, to up to 100 listeners at once, with no card.
        The station is on air while someone is live. Pro adds music and recorded shows between live ones, a weekly
        schedule, the player on your website and up to 1,000 listeners.{" "}
        <Link href="/help/free-and-pro">Free and Pro side by side</Link>.
      </>
    ),
    text: "Live shows are free: from any browser, for as long as you like, to up to 100 listeners at once, with no card. The station is on air while someone is live. Pro adds music and recorded shows between live ones, a weekly schedule, the player on your website and up to 1,000 listeners.",
  },
]

export default function StudentRadioPage() {
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
          { "@type": "ListItem", position: 2, name: "For school and university radio", item: url },
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
              <span aria-current="page">For school &amp; university radio</span>
            </nav>
            <h1 className="font-display text-hero text-balance sm:text-[clamp(2.75rem,1.6rem+3.6vw,4.75rem)]">
              A student radio station, on air by lunchtime.
            </h1>
            <p className="max-w-[34em] text-standfirst text-muted-foreground text-pretty">
              Students present, report and produce from a classroom laptop. The whole school listens on one link, on any
              phone, with nothing to install. Free to start, and no IT project.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="w-full sm:w-auto">
                <Link href="/auth/register" className="no-underline">
                  Start your school station
                </Link>
              </Button>
              <Link href="#before" className="text-body font-semibold text-muted-foreground no-underline hover:text-foreground">
                For teachers →
              </Link>
            </div>
            <TrustCues className="justify-start!" />
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end">
            <RundownDemo />
          </div>
        </div>
      </section>

      <Section id="skills">
        <SectionIntro
          split
          eyebrow="What students learn"
          title="A newsroom in a classroom."
          lead="Radio is a deadline every day. A school station gives students the real thing: a live audience, a clock that doesn’t wait, and a show that’s theirs."
        />
        <ul role="list" className="grid gap-px overflow-hidden rounded-card bg-line sm:grid-cols-2 lg:grid-cols-4">
          {SKILLS.map((s) => (
            <li key={s.title} className="flex flex-col gap-3 bg-card p-6">
              <s.icon size={26} aria-hidden className="text-on-air-text" />
              <h3 className="font-display text-card-title">{s.title}</h3>
              <p className="text-body text-muted-foreground text-pretty">{s.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="before" tone="card">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-text-faint">For teachers</span>
            <h2 className="font-display text-section text-balance">Before students go on air.</h2>
            <p className="text-section-lead text-muted-foreground text-pretty">
              A school station is publishing. Four things to set up first.
            </p>
          </div>
          <ol role="list" className="flex flex-col gap-3">
            {CHECKLIST.map((c, i) => (
              <li key={c} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 rounded-item bg-background p-4.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-ok/15 text-ok">
                  <IconCheck size={16} stroke={3} aria-label={`Step ${i + 1}`} />
                </span>
                <span className="self-center text-body text-pretty">{c}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="plans">
        <SectionIntro
          eyebrow="Free and Pro, for a school"
          title="Lunchtime shows are free."
          lead="Most school stations start on Free. Pro is for when you want the station on air all day, between the live shows."
        />
        <div className="overflow-hidden rounded-card bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-4 sm:px-6">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="w-20 p-4 text-center sm:w-28">
                  <Tag variant="ok">Free</Tag>
                </th>
                <th scope="col" className="w-20 p-4 text-center sm:w-28">
                  <ProTag />
                </th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((p) => (
                <tr key={p.what} className="border-b border-line last:border-0">
                  <th scope="row" className="p-4 text-body font-normal text-pretty sm:px-6">
                    {p.what}
                  </th>
                  {p.what === "Listeners at once" ? (
                    <>
                      <td className="p-4 text-center font-mono text-body-sm tabular-nums">100</td>
                      <td className="p-4 text-center font-mono text-body-sm tabular-nums">1,000</td>
                    </>
                  ) : (
                    [p.free, p.pro].map((on, k) => (
                      <td key={k} className="p-4 text-center">
                        {on ? (
                          <IconCheck size={18} stroke={3} className="mx-auto text-ok" aria-label="Included" />
                        ) : (
                          <span className="text-text-faint" aria-label="Not included">
                            —
                          </span>
                        )}
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="faq">
        <SectionIntro eyebrow="Questions from schools" title="Before your first show." lead="What teachers and student stations ask us before they go on air." />
        <UseCaseFaq faqs={FAQS} />
      </Section>

      <section className="border-t border-line">
        <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
          <h2 className="font-display text-marquee text-balance">On air by lunchtime.</h2>
          <p className="max-w-[32em] text-standfirst text-muted-foreground text-pretty">
            Create your school’s station in under a minute and go live from a classroom laptop. Free to start, no card.
          </p>
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/auth/register" className="no-underline">
              Start your school station
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
