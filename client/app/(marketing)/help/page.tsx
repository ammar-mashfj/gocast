import type { Metadata } from "next"
import Link from "next/link"
import { DEFAULT_OG_IMAGE } from "@/lib/seo"
import { ProTag } from "@/components/ds/Tag"
import { CATEGORIES, articlesInCategory } from "./_content/articles"

export const metadata: Metadata = {
  // Absolute, for the reason given on the article route: the root layout
  // appends "— GoCast" to anything that is not.
  title: { absolute: "Help — GoCast" },
  description:
    "How to set up your station, go live from a browser or from BUTT and Mixxx, run AutoDJ on a schedule, and fix the things that most often go wrong.",
  alternates: { canonical: "/help" },
  openGraph: {
    type: "website",
    title: "GoCast Help",
    description:
      "Guides for setting up your station, broadcasting, AutoDJ scheduling and troubleshooting.",
    url: "/help",
    siteName: "GoCast",
    locale: "en_US",
    images: [{ ...DEFAULT_OG_IMAGE, alt: "GoCast Help" }],
  },
}

/**
 * Every help article on one page, grouped.
 *
 * NOT paginated and not searched, and both are deliberate at this size. A
 * couple of dozen articles fit in one scroll, and Ctrl-F over a complete list
 * beats a search box that has to be right about synonyms. Revisit when the
 * list stops being scannable, not before.
 */
export default function HelpIndexPage() {
  // Edge to edge: from lg each category is a row with its name and blurb in
  // a left column and the articles on the right.
  return (
    <main className="mx-auto w-full max-w-page px-gutter pt-12 pb-16 sm:pt-16 sm:pb-24">
      <header className="flex max-w-3xl flex-col gap-3.5">
        <h1 className="font-display text-section">Help</h1>
        <p className="text-section-lead text-muted-foreground text-pretty">
          Short answers to the things people actually ask. If none of these cover it,{" "}
          <a href="mailto:support@gocast.fm" className="font-semibold text-on-air-text no-underline hover:text-foreground">
            email us
          </a>{" "}
          — a real person reads it.
        </p>
      </header>

      <div className="mt-12 flex flex-col sm:mt-16">
        {CATEGORIES.map((category) => {
          const articles = articlesInCategory(category.id)
          if (articles.length === 0) return null

          return (
            <section
              key={category.id}
              aria-labelledby={`cat-${category.id}`}
              className="grid gap-5 border-t border-line py-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12 lg:py-12"
            >
              <div className="flex flex-col gap-1.5 lg:sticky lg:top-24 lg:self-start">
                <h2 id={`cat-${category.id}`} className="font-display text-title">
                  {category.title}
                </h2>
                <p className="text-body text-muted-foreground text-pretty">{category.blurb}</p>
              </div>

              <ul className="flex flex-col gap-2.5">
                {articles.map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={`/help/${article.slug}`}
                      className="flex flex-col gap-1 rounded-well bg-card px-5 py-4 no-underline transition-colors hover:bg-surface-raised"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-body font-semibold text-foreground">{article.title}</span>
                        {article.pro && <ProTag />}
                      </span>
                      <span className="text-body-sm text-muted-foreground text-pretty">{article.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <aside className="mt-4 flex flex-col gap-1 rounded-card bg-card p-6 sm:p-7">
        <p className="font-display text-title-sm">Looking for the longer reads?</p>
        <p className="text-body-sm text-muted-foreground">
          The{" "}
          <Link href="/blog" className="font-semibold text-on-air-text no-underline hover:text-foreground">
            blog
          </Link>{" "}
          covers what internet radio costs, how the licensing works, and how the whole thing fits together — the
          background these pages assume.
        </p>
      </aside>
    </main>
  )
}
