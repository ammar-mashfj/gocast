import type { Metadata } from "next"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { ZoomableImage } from "@/components/content/ZoomableImage"
import { Prose } from "@/components/content/Prose"
import { notFound } from "next/navigation"
import { env } from "@/lib/env"
import { DEFAULT_OG_IMAGE } from "@/lib/seo"
import { ARTICLES, getArticle } from "../_content/articles"

type RouteParams = Promise<{ slug: string }>

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: RouteParams
}): Promise<Metadata> {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) return {}

  const path = `/blog/${article.slug}`
  return {
    title: article.title,
    description: article.metaDescription ?? article.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.metaDescription ?? article.description,
      url: path,
      siteName: "GoCast",
      locale: "en_US",
      publishedTime: article.date,
      ...(article.updated && { modifiedTime: article.updated }),
      // An article's own hero is sized per article, so it is declared without
      // dimensions rather than with made-up ones; the fallback knows its size.
      images: [article.image ? { url: article.image, alt: article.title } : DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.metaDescription ?? article.description,
      site: "@gocastfm",
      creator: "@gocastfm",
      images: [article.image ?? DEFAULT_OG_IMAGE.url],
    },
  }
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
})

export default async function ArticlePage({ params }: { params: RouteParams }) {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) notFound()

  const { title, description, date, updated, readingTime, image, faqs, Body } = article

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: date,
    ...(updated && { dateModified: updated }),
    ...(image && { image: `${env.appUrl}${image}` }),
    author: { "@type": "Organization", name: "GoCast", url: env.appUrl },
    publisher: { "@type": "Organization", name: "GoCast", url: env.appUrl, logo: `${env.appUrl}/logo.png` },
    mainEntityOfPage: `${env.appUrl}/blog/${slug}`,
  }

  const faqLd = faqs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null

  const more = ARTICLES.filter((a) => a.slug !== slug)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)

  return (
    <main className="mx-auto w-full max-w-page px-gutter pt-10 pb-16 sm:pt-14 sm:pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
        />
      )}
      <Link
        href="/blog"
        className="mb-10 inline-flex items-center gap-1.5 text-body-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
      >
        <IconArrowLeft size={14} aria-hidden="true" />
        All articles
      </Link>


      {/* Title and body at reading measure on the left; from lg a sticky rail
          on the right, level with the title, carries the rest of the blog and
          the sign-up, so the width is used without the lines getting long. */}
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 max-w-3xl">
          <header className="mb-10 flex flex-col gap-5 sm:mb-14">
            <p className="flex flex-wrap items-center gap-2.5 font-mono text-caption font-semibold tracking-wider text-text-faint uppercase">
              <time dateTime={date}>{DATE_FMT.format(new Date(date))}</time>
              {updated && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    Updated <time dateTime={updated}>{DATE_FMT.format(new Date(updated))}</time>
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              {readingTime}
            </p>
            <h1 className="font-display text-section text-balance">{title}</h1>
          </header>
          {image && (
            <ZoomableImage
              src={image}
              alt={title}
              width={1200}
              height={630}
              preload
              className="mt-0 mb-10 sm:mb-14"
            />
          )}

          <Prose>
            <Body />
          </Prose>
        </div>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-24">
          {more.length > 0 && (
            <nav aria-label="More from the blog" className="flex flex-col gap-3 rounded-card bg-card p-5">
              <h2 className="eyebrow text-text-faint">More from the blog</h2>
              <ul className="flex flex-col">
                {more.map((a) => (
                  <li key={a.slug} className="border-t border-line first:border-t-0">
                    <Link href={`/blog/${a.slug}`} className="flex flex-col gap-1 py-3 no-underline">
                      <span className="text-body font-semibold text-foreground transition-colors hover:text-on-air-text">{a.title}</span>
                      <span className="font-mono text-caption text-text-faint">{a.readingTime}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="flex flex-col gap-4 rounded-card bg-card p-5">
            <div className="flex flex-col gap-1">
              <p className="font-display text-title-sm">Ready to start your station?</p>
              <p className="text-body-sm text-muted-foreground">Free forever. Live in 60 seconds.</p>
            </div>
            <Button asChild size="lg" full>
              <Link href="/auth/register" className="no-underline">Create a free station</Link>
            </Button>
          </div>
        </aside>
      </div>
    </main>
  )
}
