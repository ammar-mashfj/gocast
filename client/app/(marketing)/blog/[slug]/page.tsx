import type { Metadata } from "next"
import Link from "next/link"
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

  return (
    <main className="px-4 md:px-10 pt-10 md:pt-16 pb-16 md:pb-24">
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
      <div className="max-w-3xl mx-auto">
        <Link
          href="/blog"
          className="inline-block text-sm text-text-muted no-underline hover:text-white transition-colors mb-10"
        >
          &larr; All articles
        </Link>

        <header className="mb-10 md:mb-14">
          <p className="text-[11px] tracking-[0.18em] uppercase text-text-faint mb-5">
            <time dateTime={date}>{DATE_FMT.format(new Date(date))}</time>
            {updated && (
              <>
                <span className="mx-2 text-white/20">·</span>
                Updated{" "}
                <time dateTime={updated}>{DATE_FMT.format(new Date(updated))}</time>
              </>
            )}
            <span className="mx-2 text-white/20">·</span>
            {readingTime}
          </p>
          <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tighter leading-tight">
            {title}
          </h1>
        </header>

        {image && (
          <ZoomableImage
            src={image}
            alt={title}
            width={1200}
            height={630}
            preload
            className="mt-0 mb-10 md:mb-14"
          />
        )}

        <Prose>
          <Body />
        </Prose>

        <aside className="mt-10 bg-white/[0.02] border border-white/[0.06] rounded-xl px-6 md:px-8 py-6 md:py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-base md:text-lg font-medium text-white">
              Ready to start your station?
            </p>
            <p className="text-sm text-text-muted mt-1">
              Free forever. Live in 60 seconds.
            </p>
          </div>
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center gap-2 bg-violet-full text-white px-5 py-2.5 rounded-lg text-sm font-medium no-underline shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(139,92,246,0.4)] transition-all whitespace-nowrap"
          >
            Sign up free <span aria-hidden>→</span>
          </Link>
        </aside>
      </div>
    </main>
  )
}
