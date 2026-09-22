import type { Metadata } from "next"

/**
 * The site-wide share image, with its REAL dimensions.
 *
 * Every page used to declare it as 1200×630, which it is not — it is
 * 1731×909. Scrapers that trust the declared size lay the card out for the
 * wrong aspect before the image arrives, and some crop to what they were told.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1731,
  height: 909,
  alt: "GoCast — Live radio from your browser",
}

/**
 * Collapse free text into something a `<meta name="description">` can hold.
 *
 * For text a person typed into a form — a station bio — rather than copy
 * written for this slot: newlines become spaces, and anything past ~160
 * characters is cut at a word boundary with an ellipsis, because search
 * results cut it there anyway and do it mid-word.
 */
export function metaDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat

  const cut = flat.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, "")}…`
}

/**
 * Metadata for a plain marketing page: its own canonical, and Open Graph and
 * Twitter cards that describe THIS page.
 *
 * Both halves matter because of how Next merges metadata. A page that sets
 * no `alternates` inherits the root layout's, and a page that sets no
 * `openGraph` inherits the homepage's title and description — so /terms was
 * telling search engines its canonical was the homepage, and a shared link to
 * it previewed as the homepage pitch.
 *
 * `title` goes through the root template ("%s — GoCast"); the card titles get
 * the brand appended by hand, since the template never touches them.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  const cardTitle = `${title} — GoCast`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: cardTitle,
      description,
      url: path,
      siteName: "GoCast",
      locale: "en_US",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: cardTitle,
      description,
      site: "@gocastfm",
      images: [DEFAULT_OG_IMAGE.url],
    },
  }
}
