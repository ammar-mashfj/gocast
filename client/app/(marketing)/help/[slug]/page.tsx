import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft, IconSparkles } from "@tabler/icons-react"
import { Prose } from "@/components/content/Prose"
import { Button } from "@/components/ds/Button"
import { ProTag } from "@/components/ds/Tag"
import { env } from "@/lib/env"
import { DEFAULT_OG_IMAGE } from "@/lib/seo"
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
      images: [{ ...DEFAULT_OG_IMAGE, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      site: "@gocastfm",
      images: [DEFAULT_OG_IMAGE.url],
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
  const url = `${env.appUrl}/help/${slug}`
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: title,
        description,
        dateModified: updated,
        author: { "@type": "Organization", name: "GoCast", url: env.appUrl },
        publisher: { "@type": "Organization", name: "GoCast", url: env.appUrl, logo: `${env.appUrl}/logo.png` },
        mainEntityOfPage: url,
      },
      // Home › Help › article. The section eyebrow on the page is left out:
      // it has no URL of its own for a crumb to point at.
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${env.appUrl}/` },
          { "@type": "ListItem", position: 2, name: "Help", item: `${env.appUrl}/help` },
          { "@type": "ListItem", position: 3, name: title, item: url },
        ],
      },
    ],
  }

  return (
    <main className="mx-auto w-full max-w-page px-gutter pt-10 pb-16 sm:pt-14 sm:pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link
        href="/help"
        className="mb-10 inline-flex items-center gap-1.5 text-body-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
      >
        <IconArrowLeft size={14} aria-hidden /> All help articles
      </Link>


      {/* Title and body at reading measure on the left; from lg a sticky rail
          on the right, level with the title, carries the related articles and
          the way to reach a person. */}
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 max-w-3xl">
          <header className="mb-10 flex flex-col gap-4 sm:mb-12">
            {group && (
              <div className="flex items-center gap-2.5">
                <span className="eyebrow text-text-faint">{group.title}</span>
                {pro && <ProTag />}
              </div>
            )}
            <h1 className="font-display text-section text-balance">{title}</h1>
            <p className="text-section-lead text-muted-foreground text-pretty">{description}</p>
            {pro && (
              <p className="inline-flex items-center gap-2 self-start rounded-chip bg-on-air-tint px-3.5 py-2 text-body-sm font-medium text-on-air-text">
                <IconSparkles size={15} className="shrink-0" aria-hidden />
                <span>
                  This one needs Pro.{" "}
                  <Link href="/help/free-and-pro" className="font-semibold text-foreground no-underline hover:underline">
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
        </div>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-24">
          {related.length > 0 && (
            <nav aria-label="Related articles" className="flex flex-col gap-3 rounded-card bg-card p-5">
              <h2 className="eyebrow text-text-faint">Read next</h2>
              <ul className="flex flex-col">
                {related.map((r) => (
                  <li key={r.slug} className="border-t border-line first:border-t-0">
                    <Link href={`/help/${r.slug}`} className="flex flex-col gap-1 py-3 no-underline">
                      <span className="text-body font-semibold text-foreground transition-colors hover:text-on-air-text">{r.title}</span>
                      <span className="text-body-sm text-muted-foreground">{r.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {/*
            The blog's rail sells a signup. This reader already has an account —
            they are here because something did not work — so the only useful
            offer beside a help page is a person to ask.
          */}
          <div className="flex flex-col gap-4 rounded-card bg-card p-5">
            <div className="flex flex-col gap-1">
              <p className="font-display text-title-sm">Still stuck?</p>
              <p className="text-body-sm text-muted-foreground">Tell us what happened and we will look at your station.</p>
            </div>
            <Button asChild variant="ghost" size="lg" full>
              <a href="mailto:hello@gocast.fm" className="no-underline">Email hello@gocast.fm</a>
            </Button>
          </div>
        </aside>
      </div>
    </main>
  )
}
