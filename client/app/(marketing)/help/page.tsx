import type { Metadata } from "next"
import Link from "next/link"
import { IconSparkles } from "@tabler/icons-react"
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
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "GoCast Help" }],
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
  return (
    <main className="px-4 md:px-10 pt-10 md:pt-16 pb-16 md:pb-24">
      <div className="max-w-3xl mx-auto">
        <header className="mb-12 md:mb-16">
          <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tighter leading-tight">
            Help
          </h1>
          <p className="text-base md:text-lg text-text-muted mt-5 leading-relaxed max-w-2xl">
            Short answers to the things people actually ask. If none of these
            cover it,{" "}
            <a
              href="mailto:support@gocast.fm"
              className="text-violet-full no-underline hover:underline"
            >
              email us
            </a>{" "}
            — a real person reads it.
          </p>
        </header>

        <div className="flex flex-col gap-12 md:gap-14">
          {CATEGORIES.map((category) => {
            const articles = articlesInCategory(category.id)
            if (articles.length === 0) return null

            return (
              <section key={category.id} aria-labelledby={`cat-${category.id}`}>
                <h2
                  id={`cat-${category.id}`}
                  className="font-display text-xl md:text-2xl font-semibold tracking-tight text-white"
                >
                  {category.title}
                </h2>
                <p className="text-base text-text-secondary tracking-[0.01em] mt-1.5">{category.blurb}</p>

                <ul className="mt-5 flex flex-col gap-2.5 list-none p-0 m-0">
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/help/${article.slug}`}
                        className="group block rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 no-underline transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm md:text-base font-medium text-white">
                            {article.title}
                          </span>
                          {article.pro && (
                            <IconSparkles
                              size={14}
                              className="text-violet-full shrink-0"
                              aria-label="Requires Pro"
                            />
                          )}
                        </span>
                        <span className="mt-1 block text-base text-text-secondary tracking-[0.01em] leading-relaxed text-pretty">
                          {article.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        <aside className="mt-14 bg-white/[0.02] border border-white/[0.06] rounded-xl px-6 md:px-8 py-6 md:py-7">
          <p className="text-base md:text-lg font-medium text-white">
            Looking for the longer reads?
          </p>
          <p className="text-sm text-text-muted mt-1">
            The{" "}
            <Link href="/blog" className="text-violet-full no-underline hover:underline">
              blog
            </Link>{" "}
            covers what internet radio costs, how the licensing works, and how
            the whole thing fits together — the background these pages assume.
          </p>
        </aside>
      </div>
    </main>
  )
}
