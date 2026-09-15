import { redirect } from "next/navigation"
import { getMyStation } from "@/lib/station-server"

/**
 * Slug-free links into the signed-in user's own station.
 *
 * `/dashboard/station/settings` forwards to
 * `/dashboard/stations/{their-slug}/settings`, and likewise for every page
 * under a station. SINGULAR, and the difference from the plural
 * `/dashboard/stations` next door is the whole point: the plural one is a dead
 * URL kept alive for old bookmarks, while this one is an address anybody can
 * be given without knowing whose station it leads to.
 *
 * WHY THIS EXISTS: announcements. One notification goes to every account at
 * once, so its button cannot carry a slug — there is no single right answer to
 * bake into the payload. Two ways to solve that, and this is the better one:
 *
 *   • Resolve the slug per recipient when the announcement is SENT. The URL is
 *     then correct for a moment and wrong forever after, because notification
 *     rows are never rewritten: rename a station and the link in that person's
 *     bell points at a slug that no longer exists. It would also make every
 *     recipient's payload different, which is not what an announcement is.
 *   • Resolve it when the link is CLICKED, which is here. The slug is looked up
 *     in the viewer's own session at the moment they follow it, so it is right
 *     even months later, right after a rename, and identical in everybody's
 *     bell.
 *
 * Nothing about this is announcement-specific, though — anywhere that wants to
 * link somebody to their own station without already knowing which one it is
 * (an email, a support reply, the marketing site) wants this URL.
 */

/**
 * The pages a station actually has.
 *
 * An allowlist rather than passing the path straight through, because the
 * caller is usually a link somebody typed into a form — and a typo in an
 * announcement is a 404 for the entire platform at once. An unrecognised path
 * lands on the station instead, which is wrong but not broken.
 */
const STATION_PAGES = ["studio", "live", "library", "audience", "settings"]

export default async function MyStationPage({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  const { path } = await params
  const station = await getMyStation()

  // No station yet. /dashboard is the onboarding page in that case, so this
  // sends them somewhere that makes sense rather than to a slug-shaped hole —
  // the same thing /dashboard/stations does.
  if (!station) {
    redirect("/dashboard")
  }

  const page = path?.join("/") ?? ""

  redirect(
    STATION_PAGES.includes(page)
      ? `/dashboard/stations/${station.slug}/${page}`
      : `/dashboard/stations/${station.slug}`,
  )
}
