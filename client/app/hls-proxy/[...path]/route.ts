import { readFile } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"

/**
 * DEV ONLY. Serves the per-station HLS output straight off disk.
 *
 * In production nginx does this — see infra/native/nginx/gocast-stream.conf,
 * which splits manifests (no-cache) from segments (immutable) because they want
 * opposite caching, and `LIQUIDSOAP_HLS_BASE_URL` points the API at that host.
 * On a dev laptop nothing serves /var/gocast/hls at all, so the player would
 * silently fall back to the Icecast mount and the HLS path could never actually
 * be exercised before it shipped.
 *
 * To use it, point the API at this route:
 *
 *     LIQUIDSOAP_HLS_BASE_URL=http://localhost:3000/hls-proxy
 *
 * Leave it empty and `hls_url` comes back null, which is a supported state:
 * the player falls back to Icecast.
 */
export const runtime = "nodejs"

/** Mirrors config('liquidsoap.hls_dir') — the host path Liquidsoap writes into. */
const HLS_DIR = process.env.LIQUIDSOAP_HLS_DIR ?? "/var/gocast/hls"

const CONTENT_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".aac": "audio/aac",
  ".ts": "video/mp2t",
  ".m4s": "audio/mp4",
  ".mp4": "audio/mp4",
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/hls-proxy/[...path]">) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 })
  }

  const { path: segments } = await ctx.params
  const requested = path.resolve(HLS_DIR, ...segments)

  // Path traversal guard. These segments come from a URL, and `..` in one of
  // them would otherwise resolve to anywhere on the disk the dev server can
  // read. The trailing separator matters: without it, a sibling directory
  // whose name merely starts with the same characters would pass.
  if (!requested.startsWith(HLS_DIR + path.sep)) {
    return new Response("Not found", { status: 404 })
  }

  const extension = path.extname(requested).toLowerCase()
  const contentType = CONTENT_TYPES[extension]

  // Only the file types HLS is made of. Nothing else in that directory — the
  // `state.json` Liquidsoap persists its segment numbering in, most obviously
  // — has any business being reachable over HTTP.
  if (!contentType) {
    return new Response("Not found", { status: 404 })
  }

  try {
    const body = await readFile(requested)

    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        // The segment window rolls every few seconds, so a cached manifest is
        // a stalled stream. Segments never change once written.
        "Cache-Control": extension === ".m3u8" ? "no-cache" : "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch {
    // A 404 here is normal and expected: a player asks for the next segment
    // slightly before Liquidsoap has finished writing it.
    return new Response("Not found", { status: 404 })
  }
}
