import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
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
    description: article.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url: path,
      siteName: "GoCast",
      locale: "en_US",
      publishedTime: article.date,
      images: [{ url: article.image ?? "/og-image.jpg", width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      site: "@gocastfm",
      creator: "@gocastfm",
      images: [article.image ?? "/og-image.jpg"],
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

  const { title, description, date, readingTime, image, faqs, Body } = article

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: date,
    ...(image && { image: `https://gocast.fm${image}` }),
    author: { "@type": "Organization", name: "GoCast" },
    publisher: {
      "@type": "Organization",
      name: "GoCast",
      url: "https://gocast.fm",
    },
    mainEntityOfPage: `https://gocast.fm/blog/${slug}`,
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
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
            <span className="mx-2 text-white/20">·</span>
            {readingTime}
          </p>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tighter leading-tight">
            {title}
          </h1>
        </header>

        {image && (
          <Image
            src={image}
            alt={title}
            width={1200}
            height={630}
            priority
            className="w-full rounded-xl border border-white/[0.06] mb-10 md:mb-14"
          />
        )}

        <article
          className="
            prose prose-invert max-w-none
            prose-headings:text-white prose-headings:font-semibold prose-headings:-tracking-wide
            prose-h2:text-2xl md:prose-h2:text-3xl prose-h2:mt-14 prose-h2:mb-5
            prose-h3:text-xl md:prose-h3:text-2xl prose-h3:mt-10 prose-h3:mb-4
            prose-p:text-zinc-300 prose-p:leading-[1.75]
            prose-li:text-zinc-300 prose-li:leading-[1.75]
            prose-strong:text-white
            prose-a:text-violet-full prose-a:no-underline hover:prose-a:underline
            prose-code:text-violet prose-code:bg-white/[0.04] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-xl
            prose-blockquote:border-l-violet-full prose-blockquote:text-text-muted prose-blockquote:not-italic
            prose-hr:border-white/[0.06]
            prose-table:border prose-table:border-white/[0.06] prose-table:rounded-xl prose-table:overflow-hidden
            prose-th:bg-white/[0.02] prose-th:text-white prose-th:border-white/[0.06]
            prose-td:border-white/[0.06] prose-td:text-zinc-300
            prose-img:rounded-xl prose-img:border prose-img:border-white/[0.06]
          "
        >
          <Body />
        </article>

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
