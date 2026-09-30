import api from './axios'
import { getCookie } from './cookies'
import { env } from './env'

/**
 * The studio's record of why its broadcast socket dropped.
 *
 * The server's own disconnect event can't carry a reason: harbor only sees a
 * socket go away. The page knows far more at that moment, whether it was
 * hidden or frozen, offline, on which network, and how much audio was stuck
 * unsent. This module snapshots that at the drop and gets it to the API's
 * station event log (POST /stations/{slug}/studio-drops) as `studio_drop`.
 *
 * Delivery is the hard part, because a drop is exactly when the network may
 * be gone or Chrome may be about to freeze or discard the tab. So a report is
 * written to localStorage the instant it is captured, updated when the
 * reconnect ends, and removed only once the API has accepted it. Anything
 * still stored is sent on the next reconnect, the next broadcast, or by a
 * keepalive request as the page closes. The API drops repeats by `id`.
 *
 * Admin monitoring only. Every failure in here is swallowed: the broadcast
 * must never be affected by its own diagnostics.
 */

export type DropOutcome = 'reconnected' | 'gave_up' | 'stopped' | 'page_closed' | 'unknown'

export interface DropReport {
  id: string
  outcome: DropOutcome
  dropped_at: string
  down_ms?: number | null
  attempts?: number | null
  last_error?: string | null
  connected_ms?: number | null
  close_code?: number | null
  close_reason?: string | null
  was_clean?: boolean | null
  visibility?: 'visible' | 'hidden'
  hidden_for_ms?: number | null
  shown_ago_ms?: number | null
  resumed_ago_ms?: number | null
  frozen?: boolean
  online?: boolean
  offline_ago_ms?: number | null
  net_type?: string | null
  net_effective?: string | null
  net_downlink?: number | null
  net_rtt?: number | null
  save_data?: boolean | null
  buffered_bytes?: number | null
  peak_buffered_bytes?: number | null
  wake_lock?: boolean
  standalone?: boolean
}

interface StoredDrop {
  slug: string
  report: DropReport
}

/** What the broadcast manager knows at the moment of the close. */
export interface DropContext {
  closeEvent: CloseEvent | null
  connectedAt: number
  bufferedBytes: number | null
  peakBufferedBytes: number
  wakeLockHeld: boolean
}

const STORAGE_KEY = 'gocast:studio-drops:v1'
// The API accepts 20 per request. A phone that drops all day without ever
// getting a report out keeps its most recent ones.
const MAX_STORED = 20

/*
 * Page lifecycle, tracked from import so the timestamps cover the whole
 * connection, not just the drop. `freeze`/`resume` are Chrome's Page
 * Lifecycle events: a frozen tab runs no JavaScript at all, so a socket that
 * dies while frozen is only noticed on resume, with the page visible again.
 * That is why "visible at the close" alone would misread a locked phone.
 */
const lifecycle = {
  hiddenAt: 0,
  shownAt: 0,
  resumedAt: 0,
  frozenSinceHidden: false,
  offlineAt: 0,
}

if (typeof document !== 'undefined') {
  if (document.visibilityState === 'hidden') lifecycle.hiddenAt = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lifecycle.hiddenAt = Date.now()
      lifecycle.frozenSinceHidden = false
    } else {
      lifecycle.shownAt = Date.now()
    }
  })
  document.addEventListener('freeze', () => { lifecycle.frozenSinceHidden = true })
  document.addEventListener('resume', () => { lifecycle.resumedAt = Date.now() })
  window.addEventListener('offline', () => { lifecycle.offlineAt = Date.now() })
  // A page being closed mid-reconnect: its report would otherwise wait for
  // the next broadcast, which may never come.
  window.addEventListener('pagehide', () => { sendOnPageClose() })
}

interface NetworkInformationLike {
  type?: string
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

function readStore(): StoredDrop[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore(drops: StoredDrop[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drops.slice(-MAX_STORED)))
  } catch { /* private mode or full: the report is lost, the broadcast is not */ }
}

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
}

function ago(at: number, now: number): number | null {
  return at === 0 ? null : Math.max(0, now - at)
}

/**
 * Snapshot the page at the moment the socket closed, and store it with
 * outcome `unknown` so it survives the tab being killed. Returns the id to
 * pass to {@link resolveDrop}.
 */
export function captureDrop(slug: string, ctx: DropContext): string | null {
  try {
    const now = Date.now()
    const hidden = document.visibilityState === 'hidden'
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    const report: DropReport = {
      id: newId(),
      outcome: 'unknown',
      dropped_at: new Date(now).toISOString(),
      connected_ms: ctx.connectedAt ? now - ctx.connectedAt : null,
      close_code: ctx.closeEvent?.code ?? null,
      close_reason: ctx.closeEvent?.reason ? ctx.closeEvent.reason.slice(0, 123) : null,
      was_clean: ctx.closeEvent?.wasClean ?? null,
      visibility: hidden ? 'hidden' : 'visible',
      hidden_for_ms: hidden ? ago(lifecycle.hiddenAt, now) : null,
      // Only meaningful when the page came back during this connection:
      // "shown 300ms before the close" is the signature of a socket that died
      // while the phone was locked and was noticed on unlock.
      shown_ago_ms: !hidden && lifecycle.shownAt > ctx.connectedAt ? ago(lifecycle.shownAt, now) : null,
      resumed_ago_ms: lifecycle.resumedAt > ctx.connectedAt ? ago(lifecycle.resumedAt, now) : null,
      frozen: lifecycle.frozenSinceHidden,
      online: navigator.onLine,
      offline_ago_ms: lifecycle.offlineAt > ctx.connectedAt ? ago(lifecycle.offlineAt, now) : null,
      net_type: conn?.type ?? null,
      net_effective: conn?.effectiveType ?? null,
      net_downlink: typeof conn?.downlink === 'number' ? conn.downlink : null,
      net_rtt: typeof conn?.rtt === 'number' ? conn.rtt : null,
      save_data: typeof conn?.saveData === 'boolean' ? conn.saveData : null,
      buffered_bytes: ctx.bufferedBytes,
      peak_buffered_bytes: ctx.peakBufferedBytes,
      wake_lock: ctx.wakeLockHeld,
      standalone: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
    }
    writeStore([...readStore(), { slug, report }])
    return report.id
  } catch {
    return null
  }
}

/** Record how the reconnect ended, then try to deliver everything pending. */
export function resolveDrop(
  id: string | null,
  outcome: Exclude<DropOutcome, 'unknown'>,
  details: { downMs: number; attempts: number; lastError?: string | null },
): void {
  if (!id) return
  const drops = readStore()
  const entry = drops.find((d) => d.report.id === id)
  if (!entry) return
  entry.report.outcome = outcome
  entry.report.down_ms = details.downMs
  entry.report.attempts = details.attempts
  entry.report.last_error = details.lastError ? details.lastError.slice(0, 200) : null
  writeStore(drops)
  void flushDrops()
}

let flushing = false

/**
 * Send every stored report, grouped by station. A report still marked
 * `unknown` is only sent when it isn't the drop in progress right now:
 * `holdId` names that one, so a flush during a reconnect doesn't report it
 * before its outcome is known.
 */
export async function flushDrops(holdId: string | null = null): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const drops = readStore().filter((d) => d.report.id !== holdId)
    const bySlug = new Map<string, DropReport[]>()
    for (const d of drops) {
      bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), d.report])
    }
    for (const [slug, reports] of bySlug) {
      try {
        await api.post(`/stations/${slug}/studio-drops`, { drops: reports })
        removeStored(reports.map((r) => r.id))
      } catch (err) {
        // A 4xx will never succeed on retry (station gone, not the owner, a
        // malformed old report): discard rather than resend forever.
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status && status >= 400 && status < 500 && status !== 429) {
          removeStored(reports.map((r) => r.id))
        }
      }
    }
  } finally {
    flushing = false
  }
}

function removeStored(ids: string[]): void {
  writeStore(readStore().filter((d) => !ids.includes(d.report.id)))
}

/**
 * Last chance as the page goes away. A keepalive fetch rather than
 * sendBeacon because the API authenticates with a bearer header, which
 * sendBeacon cannot set. Reports stay stored, since this send can't be
 * confirmed; if it did land, the API ignores the later resend by id.
 */
function sendOnPageClose(): void {
  try {
    const drops = readStore()
    if (drops.length === 0) return
    const token = getCookie('token')
    if (!token) return
    const bySlug = new Map<string, DropReport[]>()
    for (const d of drops) {
      const report = d.report.outcome === 'unknown' ? { ...d.report, outcome: 'page_closed' as const } : d.report
      bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), report])
    }
    for (const [slug, reports] of bySlug) {
      void fetch(`${env.apiUrl}/stations/${slug}/studio-drops`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ drops: reports }),
      }).catch(() => { /* the stored copy goes out next time */ })
    }
  } catch { /* nothing to do */ }
}
