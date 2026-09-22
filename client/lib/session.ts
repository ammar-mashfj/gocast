import { cookies } from "next/headers"
import { User } from "@/interfaces/User"

/**
 * The one answer to "is this person signed in", for server components.
 *
 * Two cookies carry a session and they are NOT interchangeable:
 *
 *   token  the credential. Set by the API as HttpOnly, cleared by POST
 *          /logout. The client never writes it — saveAuth() is handed a token
 *          and deliberately drops it.
 *   user   a client-written JSON cache of the identity, seven-day expiry, so
 *          the navbar can print a name without a round-trip.
 *
 * Different owners, different lifetimes, so they drift: a `user` cookie can
 * expire under a live session, and a stale `token` can outlive the identity.
 * Before this helper, three files each picked a different one and answered the
 * same question differently — the navbar offered "Sign in" while the hero
 * offered "Open dashboard", on one render of one page.
 *
 * Requiring BOTH is the rule the dashboard layout already enforced before
 * letting anyone through, so this is that rule named rather than a new one.
 * Disagreement resolves to signed-out on purpose: showing a marketing CTA to
 * someone signed in costs a click, while showing "Open dashboard" to a
 * stranger sends them into a redirect loop they cannot explain.
 */
export async function getSession(): Promise<{ user: User } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value
  const raw = cookieStore.get("user")?.value
  if (!token || !raw) return null

  try {
    return { user: JSON.parse(decodeURIComponent(raw)) as User }
  } catch {
    // A malformed cookie is not a session. It also must not be an exception:
    // this runs inside the marketing layout, so an uncaught parse error here
    // took down every public page rather than one component.
    return null
  }
}

/** Convenience for the callers that only need the boolean. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null
}
