import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft, IconSparkles } from "@tabler/icons-react"
import { Prose } from "@/components/content/Prose"
import {
  CATEGORIES,
  HELP_ARTICLES,
  getHelpArticle,
  relatedArticles,
} from "../_content/articles"

type RouteParams = Promise<{ slug: string }>

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: RouteParams
}): Promise<Metadata> {
  const { slug } = await params
  const article = getHelpArticle(slug)
  if (!article) return {}

  const path = `/help/${article.slug}`
  return {
    // `absolute` because the root layout's template already appends
    // "— GoCast"; a plain string here produces "… — GoCast Help — GoCast".
    title: { absolute: `${article.title} — GoCast Help` },
    description: article.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url: path,
      siteName: "GoCast",
      locale: "en_US",
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      site: "@gocastfm",
      images: ["/og-image.jpg"],
    },
  }
}

export default async function HelpArticlePage({ params }: { params: RouteParams }) {
  const { slug } = await params
  const article = getHelpArticle(slug)
  if (!article) notFound()

  const { title, description, category, updated, pro, Body } = article
  const group = CATEGORIES.find((c) => c.id === category)
  const related = relatedArticles(article)

  /**
   * TechArticle rather than the blog's Article, and with no `datePublished`.
   *
   * A help page is not news and has no publication event worth advertising; a
   * date in the search result makes a currently-correct answer look abandoned.
   * `dateModified` alone is the honest pair — it says when this was last
   * checked without implying it has been rotting since it was written.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    dateModified: updated,
    author: { "@type": "Organization", name: "GoCast" },
    publisher: { "@type": "Organization", name: "GoCast", url: "https://gocast.fm" },
    mainEntityOfPage: `https://gocast.fm/help/${slug}`,
  }

  return (
    <main className="px-4 md:px-10 pt-10 md:pt-16 pb-16 md:pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto">
        <Link
          href="/help"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted no-underline hover:text-white transition-colors mb-10"
        >
          <IconArrowLeft size={15} aria-hidden /> All help articles
        </Link>

        <header className="mb-10 md:mb-12">
          {group && (
            <p className="text-[11px] tracking-[0.18em] uppercase text-text-faint mb-4">
              {group.title}
            </p>
          )}
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter leading-tight">
            {title}
          </h1>
          <p className="text-base md:text-lg text-text-muted mt-4 leading-relaxed">
            {description}
          </p>
          {pro && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-lg border border-violet-full/25 bg-violet-full/[0.07] px-3.5 py-2 text-sm text-zinc-300">
              <IconSparkles size={15} className="text-violet-full shrink-0" aria-hidden />
              <span>
                This one needs Pro.{" "}
                <Link href="/help/free-and-pro" className="text-violet-full no-underline hover:underline">
                  What that includes
                </Link>
                .
              </span>
            </p>
          )}
        </header>

        <Prose>
          <Body />
        </Prose>

        {related.length > 0 && (
          <nav aria-label="Related articles" className="mt-14 border-t border-white/[0.06] pt-8">
            <h2 className="font-display text-[11px] tracking-[0.18em] uppercase text-text-faint mb-5">
              Read next
            </h2>
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/help/${r.slug}`}
                    className="group block rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 no-underline transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
                  >
                    <span className="block text-sm font-medium text-white">{r.title}</span>
                    <span className="mt-1 block text-base text-text-secondary tracking-[0.01em]">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/*
          The blog's footer sells a signup. This reader already has an account —
          they are here because something did not work — so the only useful
          offer at the bottom of a help page is a person to ask.
        */}
        <aside className="mt-10 bg-white/[0.02] border border-white/[0.06] rounded-xl px-6 md:px-8 py-6 md:py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-base md:text-lg font-medium text-white">
              Still stuck?
            </p>
            <p className="text-sm text-text-muted mt-1">
              Tell us what happened and we will look at your station.
            </p>
          </div>
          <a
            href="mailto:hello@gocast.fm"
            className="inline-flex items-center justify-center gap-2 bg-white/[0.06] border border-white/[0.08] text-white px-5 py-2.5 rounded-lg text-sm font-medium no-underline hover:bg-white/[0.1] transition-colors whitespace-nowrap"
          >
            Email hello@gocast.fm
          </a>
        </aside>
      </div>
    </main>
  )
}
