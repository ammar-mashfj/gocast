import type { Metadata } from "next"
import Link from "next/link"
import { ARTICLES } from "./_content/articles"

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides, comparisons, and notes on internet radio.",
  alternates: { canonical: "/blog" },
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

export default function BlogIndexPage() {
  const sorted = [...ARTICLES].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <main className="px-4 md:px-10 pt-12 md:pt-20 pb-16 md:pb-24">
      <div className="max-w-[1024px] mx-auto">
        <header className="mb-12 md:mb-16">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tighter leading-tight mb-4">
            Blog
          </h1>
          <p className="text-base md:text-lg text-text-muted leading-relaxed max-w-[520px]">
            Guides, comparisons, and notes on internet radio.
          </p>
        </header>

        <ul className="list-none p-0 m-0">
          {sorted.map((article) => (
            <li key={article.slug} className="border-b border-white/[0.06]">
              <Link
                href={`/blog/${article.slug}`}
                className="group block py-7 md:py-9 no-underline"
              >
                <p className="text-[11px] tracking-[0.18em] uppercase text-text-faint mb-3">
                  <time dateTime={article.date}>
                    {DATE_FMT.format(new Date(article.date))}
                  </time>
                  <span className="mx-2 text-white/20">·</span>
                  {article.readingTime}
                </p>
                <h2 className="text-2xl md:text-3xl font-semibold -tracking-wide text-white mb-3 group-hover:text-violet-full transition-colors">
                  {article.title}
                </h2>
                <p className="text-sm md:text-base text-text-muted leading-relaxed max-w-[640px]">
                  {article.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
