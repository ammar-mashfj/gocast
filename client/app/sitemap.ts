import type { MetadataRoute } from "next"
import { env } from "@/lib/env"
import { ARTICLES } from "./(marketing)/blog/_content/articles"
import { HELP_ARTICLES } from "./(marketing)/help/_content/articles"

/**
 * The site's own pages: home, blog, help, legal.
 *
 * Stations live in their own file, app/station/sitemap.ts, served at
 * /station/sitemap.xml and listed beside this one in robots.txt. They change
 * on a different clock — an owner's edit, not a deploy — and keeping them
 * apart means an API outage empties that file rather than this one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl

  // Real dates or none. `lastModified: now` stamped every page as changed on
  // every build, and Google stops trusting a sitemap's lastmod once it notices
  // the dates move without the pages doing so — which costs the articles
  // below, whose dates are real, their fast re-crawl too.
  const newestPost = latest(ARTICLES.map((a) => a.updated ?? a.date))
  const newestHelp = latest(HELP_ARTICLES.map((a) => a.updated))

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/blog`, lastModified: newestPost, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/help`, lastModified: newestHelp, changeFrequency: "weekly", priority: 0.6 },
    // The "Last updated" line on each page — bump both together.
    { url: `${base}/privacy`, lastModified: new Date("2026-09-08"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date("2026-09-08"), changeFrequency: "yearly", priority: 0.3 },
  ]

  // Derived from the article registry so publishing a post is a one-file
  // change — a hardcoded list here silently leaves new articles unindexed.
  const articleRoutes: MetadataRoute.Sitemap = ARTICLES.map((a) => ({
    url: `${base}/blog/${a.slug}`,
    lastModified: new Date(a.updated ?? a.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }))

  // Same reasoning as the blog routes above, and the same registry shape.
  // Help pages are indexed deliberately: "gocast encoder won't connect" is a
  // search somebody makes, and the answer should be ours rather than a forum's.
  const helpRoutes: MetadataRoute.Sitemap = HELP_ARTICLES.map((a) => ({
    url: `${base}/help/${a.slug}`,
    lastModified: new Date(a.updated),
    changeFrequency: "monthly",
    priority: 0.5,
  }))

  return [...staticRoutes, ...articleRoutes, ...helpRoutes]
}

/** The most recent of a list of ISO dates, or undefined for an empty list. */
function latest(dates: string[]): Date | undefined {
  const sorted = [...dates].sort()
  return sorted.length ? new Date(sorted[sorted.length - 1]) : undefined
}
