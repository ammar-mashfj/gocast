import axios from 'axios'
import api from './axios'
import { BITRATE_TIERS, type Bitrate } from './audioEngine'

/**
 * The go-live connection check: how fast can this browser upload, and which
 * ingest bitrate fits through it?
 *
 * Built after kerygma (2026-09-30), a studio on a line the browser rated 3g
 * that dropped three times in seven minutes: its socket held 8–11 seconds of
 * unsent audio at each drop, and past about ten seconds harbor's input
 * timeout gives up on the source. A broadcast that cannot keep up is better
 * refused, or sent at a bitrate that fits, than started and lost.
 *
 * Measured by uploading a throwaway body to the API and timing it, minus the
 * time an empty request takes (the round trip and server work the upload
 * also pays). The API is not the harbor, but the broadcaster's own uplink is
 * the narrow part of both paths, and it is what this has to find.
 */

/** Big enough to get past TCP slow start on an ordinary line, small enough to finish on a bad one. */
const PROBE_BYTES = 96 * 1024
/**
 * Past this the answer is already "too slow": 96 KB in 10s is under 80 kbps,
 * below what even the lowest tier needs.
 */
const PROBE_TIMEOUT_MS = 10000
/**
 * Upload needed per kbps of audio. The stream shares the line with the page's
 * own requests, and a mobile uplink wobbles; a tier that fits exactly falls
 * behind on the first dip.
 */
const HEADROOM = 1.5

/** Below this there is no tier that will hold. */
export const MIN_UPLINK_KBPS = BITRATE_TIERS[BITRATE_TIERS.length - 1] * HEADROOM

/**
 * The check itself didn't finish: offline, a network blip, the API erroring.
 * Not a verdict on the line either way, so going live waits for a retry
 * rather than guessing a bitrate.
 */
export const UPLINK_CHECK_FAILED =
  "Couldn't check your connection. Make sure you're online, then try again."

export interface UplinkCheck {
  /** Measured upload speed. */
  kbps: number
  /** The bitrate to broadcast at, or null when no tier fits. */
  bitrate: Bitrate | null
}

/** The best tier the measured speed carries with headroom to spare. */
export function bitrateForUplink(kbps: number): Bitrate | null {
  return BITRATE_TIERS.find((tier) => kbps >= tier * HEADROOM) ?? null
}

function randomBody(bytes: number): Uint8Array {
  // Random so nothing on the path can compress it and flatter the result.
  // getRandomValues fills at most 64 KB per call.
  const body = new Uint8Array(bytes)
  for (let offset = 0; offset < bytes; offset += 65536) {
    crypto.getRandomValues(body.subarray(offset, Math.min(bytes, offset + 65536)))
  }
  return body
}

async function timedPost(body: Uint8Array, timeout: number): Promise<number> {
  const startedAt = performance.now()
  await api.post('/broadcast/uplink-probe', body, {
    headers: { 'Content-Type': 'application/octet-stream' },
    timeout,
  })
  return performance.now() - startedAt
}

/** Upload speed in kbps. Throws {@link UPLINK_CHECK_FAILED} when it can't be measured. */
export async function measureUplink(): Promise<number> {
  let overheadMs: number
  try {
    // The first request pays for DNS and the TCP/TLS handshakes, which the
    // upload reuses. Timing it as the baseline would subtract costs the
    // upload never pays and overstate the line, worst on high-latency
    // mobile. So warm up untimed, then time a second empty request.
    await timedPost(new Uint8Array(0), PROBE_TIMEOUT_MS)
    overheadMs = await timedPost(new Uint8Array(0), PROBE_TIMEOUT_MS)
  } catch {
    throw new Error(UPLINK_CHECK_FAILED)
  }

  const bits = PROBE_BYTES * 8
  try {
    const totalMs = await timedPost(randomBody(PROBE_BYTES), PROBE_TIMEOUT_MS)
    // A fast line can finish inside the overhead's own jitter.
    const transferMs = Math.max(totalMs - overheadMs, 1)
    return Math.round(bits / transferMs)
  } catch (err) {
    // Out of time is itself the measurement: slower than this.
    if (axios.isAxiosError(err) && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
      return Math.round(bits / PROBE_TIMEOUT_MS)
    }
    throw new Error(UPLINK_CHECK_FAILED)
  }
}

export async function checkUplink(): Promise<UplinkCheck> {
  const kbps = await measureUplink()
  return { kbps, bitrate: bitrateForUplink(kbps) }
}

export type UplinkOutcome = 'ok' | 'lowered' | 'blocked' | 'failed'

interface NetworkInformationLike {
  type?: string
  effectiveType?: string
  downlink?: number
  rtt?: number
}

/**
 * Tell the API what the check decided (POST /stations/{slug}/uplink-checks),
 * so thresholds can be tuned on real lines. Includes the browser's own guess
 * at the network to compare against. Fire and forget: a lost report must
 * never hold up or fail going live, and a `failed` one often can't arrive.
 */
export function reportUplinkCheck(
  slug: string,
  outcome: UplinkOutcome,
  check: { kbps: number | null; bitrate: Bitrate | null },
): void {
  try {
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    void api.post(`/stations/${slug}/uplink-checks`, {
      outcome,
      kbps: check.kbps,
      bitrate: check.bitrate,
      net_type: conn?.type ?? null,
      net_effective: conn?.effectiveType ?? null,
      net_downlink: typeof conn?.downlink === 'number' ? conn.downlink : null,
      net_rtt: typeof conn?.rtt === 'number' ? conn.rtt : null,
    }).catch(() => { /* monitoring only */ })
  } catch { /* monitoring only */ }
}
