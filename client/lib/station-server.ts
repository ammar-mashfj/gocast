import { apiFetch } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"

/**
 * The signed-in user's station — the one they own, or null if they have not
 * created it yet.
 *
 * A user has exactly one station. The API has not caught up with that: it
 * still serves `/stations` as a collection, and the plans table still carries
 * a `max_stations` column that reads 5 on Pro. So this function is where the
 * one-station rule is actually applied on the front end, and it is deliberate
 * that there is only one of it — every dashboard page resolves the station
 * through here rather than reaching into the array itself.
 *
 * OLDEST WINS, sorted explicitly rather than trusting the order the backend
 * happened to return (`$request->user()->stations` carries no orderBy). An
 * account that somehow holds two — an old signup, a direct API call — then
 * gets the SAME station on every page. Picking whatever landed first in the
 * response would let the dashboard and the sidebar disagree about which
 * station is "theirs", which is far worse than showing the older one.
 */
export async function getMyStation(): Promise<Station | null> {
  const { data } = await apiFetch<{ data: Station[] }>("/stations")

  const [oldest] = [...data].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  return oldest ?? null
}
