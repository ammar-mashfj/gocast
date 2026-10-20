import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo"
import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"
import { ARTICLES } from "./_content/articles"

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description: "Guides, comparisons, and notes on internet radio.",
  path: "/blog",
})

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

export default function BlogIndexPage() {
  const sorted = [...ARTICLES].sort((a, b) => b.date.localeCompare(a.date))

  // The page container the navbar uses, edge to edge: from lg each entry is
  // a row with the date in a left column and the piece on the right, which
  // is how the width gets used without the description lines running long.
  return (
    <main className="mx-auto w-full max-w-page px-gutter pt-12 pb-16 sm:pt-16 sm:pb-24">
      {/* The title is the plain section name: a sentence set this large read
          as something to click, next to a list of things that are. */}
      <header className="flex max-w-3xl flex-col gap-3.5">
        <h1 className="font-display text-section">Blog</h1>
        <p className="text-section-lead text-muted-foreground text-pretty">
          Notes on internet radio — guides, comparisons, and what we learned building a station that never signs off.
        </p>
      </header>

      <ul className="mt-10 flex flex-col sm:mt-14">
        {sorted.map((article) => (
          <li key={article.slug} className="border-t border-line last:border-b">
            {/* Each row says it is a link three ways: the violet title, the
                arrow at the end, and the row lifting under the pointer. */}
            <Link
              href={`/blog/${article.slug}`}
              className="group -mx-4 grid gap-3 rounded-card px-4 py-7 no-underline transition-colors hover:bg-card sm:py-9 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-start lg:gap-10"
            >
              <p className="flex items-center gap-2.5 font-mono text-caption font-semibold tracking-wider text-text-faint uppercase lg:flex-col lg:items-start lg:gap-1.5 lg:pt-2">
                <time dateTime={article.date}>{DATE_FMT.format(new Date(article.date))}</time>
                <span aria-hidden className="lg:hidden">·</span>
                <span>{article.readingTime}</span>
              </p>
              <span className="flex min-w-0 flex-col gap-3">
                <h2 className="font-display text-title-lg text-balance text-on-air-text transition-colors group-hover:text-foreground">
                  {article.title}
                </h2>
                <p className="max-w-[72ch] text-body text-muted-foreground text-pretty">{article.description}</p>
                <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-foreground lg:hidden">
                  Read the article <IconArrowRight size={14} aria-hidden="true" />
                </span>
              </span>
              <span
                aria-hidden="true"
                className="hidden size-11 items-center justify-center self-center rounded-full bg-surface-control text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background lg:flex"
              >
                <IconArrowRight size={18} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
