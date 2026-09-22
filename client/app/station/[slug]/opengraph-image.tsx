import { ImageResponse } from "next/og"
import { getStation } from "./getStation"

/**
 * The share card for a station: its artwork beside its name, at the 1200×630
 * every network actually lays out.
 *
 * The raw artwork was the share image before, declared as 1200×630. It is
 * almost always square, so X and Facebook centre-cropped it into a letterbox
 * strip — often cutting through the wordmark that WAS the artwork — and the
 * card carried no station name at all unless the network printed og:title.
 * Composing it here fixes both and puts the name in the image itself.
 */
export const alt = "Station artwork and name, on GoCast"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** What the image renderer can decode. WebP and AVIF are not on the list. */
const DRAWABLE = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif"])

/** Refuse anything bigger — the card is 630px tall; a 20 MB upload is not art. */
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024

/**
 * Artwork as a data URL, or null for anything the card should not try to draw.
 *
 * Fetched here rather than handed to <img src> so an unsupported format or a
 * dead URL degrades to the no-artwork design instead of failing the whole
 * image — a 500 on og:image is a card with no picture on every network.
 */
async function loadArtwork(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
    if (!DRAWABLE.has(type)) return null
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > MAX_ARTWORK_BYTES) return null
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`
  } catch {
    return null
  }
}

/** Long names step down in size rather than overflow the card. */
function nameSize(name: string): number {
  if (name.length <= 14) return 92
  if (name.length <= 24) return 74
  if (name.length <= 40) return 58
  return 46
}

export default async function StationOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const station = await getStation(slug)
  const name = station?.name ?? "GoCast"
  const artwork = await loadArtwork(station?.artwork_url ?? null)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 80px",
          background:
            "radial-gradient(circle at 18% 20%, rgba(139,92,246,0.32), transparent 45%), radial-gradient(circle at 85% 90%, rgba(236,72,153,0.14), transparent 40%), #0b0a10",
          color: "white",
        }}
      >
        {artwork ? (
          <img
            src={artwork}
            width={400}
            height={400}
            alt=""
            style={{ borderRadius: 32, objectFit: "cover", boxShadow: "0 40px 100px rgba(139,92,246,0.35)" }}
          />
        ) : (
          <div
            style={{
              width: 400,
              height: 400,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #1a1a2e, #0f0f1f 55%, #1a1a2e)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: 170,
                height: 170,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #2d1b69, #8b5cf6)",
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 999, background: "#0b0a10", display: "flex" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22, minWidth: 0 }}>
          {station?.genre && (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#a78bfa",
              }}
            >
              {station.genre}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: nameSize(name),
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -2,
            }}
          >
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, fontSize: 28, color: "rgba(255,255,255,0.72)" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "#8b5cf6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 800,
                color: "white",
              }}
            >
              G
            </div>
            Listen on GoCast
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
