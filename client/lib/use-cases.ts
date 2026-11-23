/**
 * The audience pages that exist (`/for/<slug>`), for the sitemap.
 *
 * One entry per page that is actually built. The homepage's "Who it's for"
 * row lists every planned audience (docs/USE-CASE-PAGES-PLAN.md); this list
 * only grows as each page ships, so the sitemap never points at a 404.
 * `updated` is the date the page's copy last changed — a real date, never
 * "now" (see app/sitemap.ts for why).
 */
export const USE_CASE_PAGES = [
  { slug: "churches", updated: "2026-11-23" },
  { slug: "djs", updated: "2026-11-23" },
  { slug: "news", updated: "2026-11-23" },
  { slug: "musicians", updated: "2026-11-23" },
  { slug: "community-radio", updated: "2026-11-23" },
  { slug: "fm-simulcast", updated: "2026-11-23" },
  { slug: "student-radio", updated: "2026-11-23" },
  { slug: "ai-radio", updated: "2026-11-23" },
  { slug: "diaspora-radio", updated: "2026-11-23" },
  { slug: "mosques", updated: "2026-11-23" },
] as const

export type UseCasePageSlug = (typeof USE_CASE_PAGES)[number]["slug"]

export function isUseCasePageBuilt(slug: string): boolean {
  return USE_CASE_PAGES.some((p) => p.slug === slug)
}
