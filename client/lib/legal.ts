/**
 * When each legal page last changed, as ISO dates.
 *
 * The page's "Last updated" line and the sitemap's lastmod both read from
 * here, so bumping one can no longer leave the other behind.
 */
export const LEGAL_UPDATED = {
  privacy: "2026-09-26",
  terms: "2026-10-20",
} as const

// UTC, because the ISO date parses as UTC midnight: formatting it in a
// timezone west of Greenwich would print the day before.
const LONG_DATE = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })

/** "October 14, 2026" — the form the legal pages print. */
export function formatLegalDate(iso: string): string {
  return LONG_DATE.format(new Date(iso))
}
