"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import api from "@/lib/axios"
import type {
  Notification,
  NotificationPage,
  UnreadCount,
} from "@/interfaces/Notification"

/**
 * How often the badge re-checks while the tab is visible.
 *
 * A minute, not the 8s the listener count uses. That number is live telemetry
 * somebody is actively watching; this is a mailbox, and nothing in it is worth
 * knowing about fifty seconds sooner. The poll also stops entirely while the
 * tab is hidden and catches up on focus, so a dashboard left open in a
 * background tab overnight costs nothing.
 *
 * There is no push transport to replace this with yet — the app has no Reverb
 * or Pusher connection (BROADCAST_CONNECTION=log). When there is, the
 * notification classes gain ShouldBroadcast and this becomes a fallback.
 */
const POLL_MS = 60_000

/**
 * The query of Laravel's next-page link, as params to hand straight back.
 *
 * ALL of it, not just the cursor. The link carries whatever the page was
 * fetched with — `filter`, `category` — alongside the cursor, and picking out
 * only the cursor is how page two of a filtered feed quietly returns
 * unfiltered rows.
 */
function queryFrom(url: string | null): Record<string, string> | null {
  if (!url) return null
  try {
    return Object.fromEntries(new URL(url).searchParams)
  } catch {
    return null
  }
}

export interface UseNotifications {
  items: Notification[]
  unreadCount: number
  cappedAt: number
  /** True only for the first load of the feed, so the panel can skeleton once. */
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  /** Feed request failed. The badge is independent and may still be current. */
  failed: boolean
  loadFeed: () => void
  loadMore: () => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
}

/**
 * The dashboard bell's state.
 *
 * TWO SEPARATE REQUESTS, on purpose. The badge polls `/unread-count`, which is
 * one aggregate; the feed itself is fetched only when the panel is opened. A
 * dashboard sitting open all day therefore costs one small count query a
 * minute rather than a page of rows and JSON, and the endpoint that gets
 * polled is the one with the poll-sized rate limit on it.
 *
 * Every mutation is optimistic and rolls back on failure. These are one-click
 * actions on a list the user is looking at, so the alternative — a spinner on
 * a row for the length of a round trip — is more visible than the failure it
 * protects against, and the failure restores the row anyway.
 */
export function useNotifications(): UseNotifications {
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [cappedAt, setCappedAt] = useState(99)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [nextQuery, setNextQuery] = useState<Record<string, string> | null>(null)

  // Refs, not state: these gate effects and callbacks without being rendered,
  // and putting them in state would re-run the poll effect on every change.

  /** The feed has succeeded at least once. Gates the skeleton, not the fetch. */
  const loadedOnce = useRef(false)

  /**
   * A request of each kind is out. Two refs rather than one, because they guard
   * different things: a duplicate first page, and a duplicate "load older".
   * Sharing a single ref meant reopening the panel while "Load older" was in
   * flight silently skipped the refresh — no rows, no skeleton, no error.
   */
  const feedInFlight = useRef(false)
  const moreInFlight = useRef(false)

  /**
   * Counters, not booleans, because more than one response can be in flight and
   * only one of them is still the truth. Both are compared against the value a
   * request captured when it was SENT, and a response whose number has moved is
   * a picture of a list that no longer exists.
   *
   * `feedSeq` counts opens of the panel. A "load older" page requested against
   * one page one has nothing to append to once page one has been re-read from
   * the head — the rows it holds may now be on page one, so appending them
   * duplicates React keys, and its `next` link points back into a cursor the
   * list has already passed.
   *
   * `mutationSeq` counts our own writes. It moves twice per write: when the
   * request goes out, which discards a feed read already in flight, and again
   * when it lands, which discards a feed read that raced it and would otherwise
   * have looked current. Without the second bump, a re-read sent between the
   * two can answer from before the write and be believed.
   */
  const feedSeq = useRef(0)
  const mutationSeq = useRef(0)

  /** A feed response was discarded; re-read as soon as the line is free. */
  const feedIsStale = useRef(false)

  /**
   * Mark the feed's picture of the server out of date. Called on both edges of
   * every write — see `mutationSeq`.
   */
  const invalidateFeed = useCallback(() => {
    mutationSeq.current += 1
  }, [])

  /**
   * When the badge was last ASKED for — the attempt, not the answer.
   *
   * Gates the catch-up fetch below. Recording the attempt rather than the
   * success is deliberate: if the endpoint is failing, a timestamp only written
   * on success would leave every return to the tab looking like a stale badge
   * and fire another doomed request, which is the one case that turns a
   * swallowed error into a burst.
   */
  const lastCountAt = useRef(0)

  const refreshCount = useCallback(async () => {
    lastCountAt.current = Date.now()

    try {
      const { data } = await api.get<{ data: UnreadCount }>("/notifications/unread-count")
      setUnreadCount(data.data.unread_count)
      setCappedAt(data.data.capped_at)
    } catch {
      // Keep the last known badge and try again next tick. A failed poll is
      // not worth telling anyone about.
    }
  }, [])

  // Poll the badge; pause while hidden, catch up on return. A tab restored
  // after an hour asleep should be current immediately, not up to a minute
  // late, and a tab nobody is looking at should not be asking at all.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    function start() {
      // Catch up only if the badge is actually stale. `start` runs on every
      // return to the tab, and alt-tabbing between an editor and the browser
      // is a real way to produce dozens of visibility transitions a minute —
      // each one an immediate request, for a number that changes on the order
      // of days. Enough of them in one minute meets the endpoint's own rate
      // limit, and because a failed poll is deliberately silent the only
      // symptom would be a badge that stops updating for no visible reason.
      if (Date.now() - lastCountAt.current >= POLL_MS) {
        refreshCount()
      }

      timer ??= setInterval(refreshCount, POLL_MS)
    }

    function stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        start()
      } else {
        stop()
      }
    }

    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [refreshCount])

  /**
   * The first page, re-fetched on every open of the panel.
   *
   * NOT ONCE PER MOUNT. The badge keeps polling while the panel is shut, so by
   * the time somebody opens it the list is the one thing on screen that is out
   * of date — and a bell reading "2" above a list containing neither of them is
   * worse than no bell at all. The dashboard shell stays mounted across
   * client-side navigation, so "once per mount" can mean once a day.
   *
   * `loadedOnce` no longer gates the request; it gates the SKELETON. A re-open
   * swaps the rows in place, and flashing three grey bars over a list the user
   * is already looking at reads as breakage rather than as freshness. It also
   * decides whether a failure is worth showing — see below.
   *
   * Re-fetching from the head also drops any older pages "Load older" had
   * added, which is the right reset: the cursor they were paging from may not
   * even be on page one any more.
   */
  const loadFeed = useCallback(async () => {
    if (feedInFlight.current) return

    feedInFlight.current = true
    setFailed(false)

    feedSeq.current += 1
    const mutations = mutationSeq.current

    if (!loadedOnce.current) {
      setLoading(true)
    }

    try {
      const { data } = await api.get<NotificationPage>("/notifications")

      // Discard a response the user has already overtaken. "Mark all read" is
      // clickable the moment the panel opens — it is rendered off the polled
      // badge, not off this request — so a click while the first page is still
      // in flight is ordinary, and believing the response that follows would
      // put every row back to unread and restore a badge for a feed the server
      // considers fully read. Nothing is rendered from it; the finally block
      // goes and gets the page that reflects the write.
      if (mutationSeq.current !== mutations) {
        feedIsStale.current = true

        return
      }

      setItems(data.data)
      setNextQuery(queryFrom(data.links?.next ?? null))
      setUnreadCount(data.meta.unread_count)
      loadedOnce.current = true
    } catch {
      // Only surface the error state when there is nothing behind it. A failed
      // REFETCH still has the rows from last time, and replacing something
      // true with "couldn't load notifications" is a worse answer — the next
      // open retries, and the badge was never coming from here anyway.
      setFailed(!loadedOnce.current)
    } finally {
      feedInFlight.current = false
      setLoading(false)

      // Re-read rather than leave the panel showing the last list. This only
      // fires after a discard, and a discard only happens while `mutationSeq`
      // is moving, so it settles: the first read that starts after the last
      // write lands captures a number that no longer changes.
      if (feedIsStale.current) {
        feedIsStale.current = false
        loadFeed()
      }
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextQuery || moreInFlight.current) return

    moreInFlight.current = true
    setLoadingMore(true)

    const seq = feedSeq.current

    try {
      const { data } = await api.get<NotificationPage>("/notifications", {
        params: nextQuery,
      })

      // Only append to the list this page was asked for. `feedInFlight` and
      // `moreInFlight` are deliberately independent, so closing and reopening
      // the panel while this was out has already replaced the list from the
      // head — appending an older page onto it duplicates any row that has
      // since moved onto page one and rewinds `nextQuery` to a cursor the feed
      // has passed. Dropping the page costs one press of a button that is
      // still there.
      if (feedSeq.current !== seq) return

      setItems((current) => [...current, ...data.data])
      setNextQuery(queryFrom(data.links?.next ?? null))
    } catch {
      // Leave the cursor where it is so the button can simply be pressed again.
    } finally {
      moreInFlight.current = false
      setLoadingMore(false)
    }
  }, [nextQuery])

  /**
   * Mark one read.
   *
   * "Was it unread" is answered from `items` BEFORE the update, never from
   * inside the updater. React runs an updater synchronously only as an
   * optimisation — when the component has no update already pending — so a flag
   * set inside one and read on the next line is still false whenever the badge
   * poll has just scheduled a render. That silently swallowed the request: the
   * row looked read and the badge dropped, but the server never heard, so the
   * notification came back unread on the next open.
   */
  const markRead = useCallback((id: string) => {
    const target = items.find((item) => item.id === id)

    if (!target || target.read_at) return

    invalidateFeed()

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
      ),
    )
    setUnreadCount((count) => Math.max(0, count - 1))

    api
      .post<{ meta?: { unread_count?: number } }>(`/notifications/${id}/read`)
      .then(({ data }) => {
        // Prefer the server's count to the optimistic one. It was counted after
        // the write, so it also carries anything another tab has done since.
        if (typeof data.meta?.unread_count === "number") {
          setUnreadCount(data.meta.unread_count)
        }
      })
      .catch(() => {
        // Roll back this row only. The count is restored from the server rather
        // than incremented locally, because other tabs may have moved it since.
        setItems((current) =>
          current.map((item) => (item.id === id ? { ...item, read_at: null } : item)),
        )
        refreshCount()
      })
      .finally(invalidateFeed)
  }, [items, refreshCount, invalidateFeed])

  const markAllRead = useCallback(() => {
    // The ids this call is actually changing. Not an early return when the set
    // is empty: the badge counts the whole feed and the loaded page is only the
    // head of it, so "nothing unread on screen" and "nothing unread" are
    // different questions and only the server can answer the second.
    const wereUnread = new Set(
      items.filter((item) => !item.read_at).map((item) => item.id),
    )

    invalidateFeed()

    setItems((current) =>
      current.map((item) =>
        wereUnread.has(item.id) ? { ...item, read_at: new Date().toISOString() } : item,
      ),
    )
    setUnreadCount(0)

    api
      .post("/notifications/read-all")
      .catch(() => {
        // Only the rows this call touched. Restoring the array as it looked
        // before would also undo whatever happened while the request was out.
        setItems((current) =>
          current.map((item) => (wereUnread.has(item.id) ? { ...item, read_at: null } : item)),
        )
        refreshCount()
      })
      .finally(invalidateFeed)
  }, [items, refreshCount, invalidateFeed])

  const remove = useCallback((id: string) => {
    const index = items.findIndex((item) => item.id === id)

    if (index === -1) return

    const removed = items[index]

    invalidateFeed()

    setItems((current) => current.filter((item) => item.id !== id))

    if (!removed.read_at) {
      setUnreadCount((count) => Math.max(0, count - 1))
    }

    api
      .delete<{ data?: { unread_count?: number } }>(`/notifications/${id}`)
      .then(({ data }) => {
        if (typeof data.data?.unread_count === "number") {
          setUnreadCount(data.data.unread_count)
        }
      })
      .catch(() => {
        // Put this row back where it was, rather than restoring the whole list
        // as it looked before the click. Dismissing two rows in quick
        // succession means the first one's failure would otherwise resurrect
        // the second.
        setItems((current) => {
          if (current.some((item) => item.id === id)) return current

          const restored = [...current]
          restored.splice(Math.min(index, restored.length), 0, removed)

          return restored
        })
        refreshCount()
      })
      .finally(invalidateFeed)
  }, [items, refreshCount, invalidateFeed])

  return {
    items,
    unreadCount,
    cappedAt,
    loading,
    loadingMore,
    hasMore: nextQuery !== null,
    failed,
    loadFeed,
    loadMore,
    markRead,
    markAllRead,
    remove,
  }
}
