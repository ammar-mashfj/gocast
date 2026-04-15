import Link from "next/link"
import { Station } from "@/interfaces/Station"
import styles from "./LiveNow.module.css"

const API_URL = process.env.NEXT_PUBLIC_API_URL

const EQ_CLASSES = [styles.eq1, styles.eq2, styles.eq3, styles.eq4, styles.eq5]

const GRADIENTS = [
  "linear-gradient(135deg, #1a0533, #2d1b69)",
  "linear-gradient(135deg, #0f2b1a, #1a5c33)",
  "linear-gradient(135deg, #2b1a0f, #5c3a1a)",
  "linear-gradient(135deg, #1a0f2b, #3a1a5c)",
]

function Equalizer() {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
      {EQ_CLASSES.map((cls, i) => (
        <span key={i} className={`w-0.5 rounded-sm bg-violet-muted ${cls}`} />
      ))}
    </div>
  )
}

function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-emerald-live tracking-wide uppercase font-medium">
      <div className={`size-[5px] bg-emerald-live rounded-full ${styles.liveDot}`} />
      Live
    </div>
  )
}

async function getFeaturedStations(): Promise<Station[]> {
  try {
    const res = await fetch(`${API_URL}/public/featured`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

export default async function LiveNow() {
  const stations = await getFeaturedStations()

  if (stations.length === 0) return null

  return (
    <section className="px-10 py-24" id="live">
      <div className="text-center mb-16">
        <div className="text-[11px] tracking-[3px] uppercase text-violet-muted mb-4">
          Live now
        </div>
        <h2 className="text-[40px] font-semibold -tracking-wide leading-[1.15] mb-4">
          Discover what&apos;s on air.
        </h2>
        <p className="text-base text-text-muted/85 max-w-[480px] leading-[1.7] mx-auto">
          Stations broadcasting right now, powered by GoCast.
        </p>
      </div>

      <div className={`grid gap-3 ${
        stations.length === 1 ? "grid-cols-1 max-w-sm mx-auto"
          : stations.length === 2 ? "grid-cols-2 max-w-2xl mx-auto"
          : stations.length === 3 ? "grid-cols-3"
          : "grid-cols-4"
      }`}>
        {stations.map((station, i) => (
          <Link
            key={station.id}
            href={`/station/${station.slug}`}
            className="group bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer overflow-hidden transition-all hover:border-violet-border/50 hover:bg-violet-full/[0.03] hover:-translate-y-0.5 no-underline"
          >
            <div className="flex justify-between items-start mb-3.5">
              <div
                className="size-12 rounded-[10px] flex items-center justify-center text-[22px] transition-transform group-hover:scale-105 overflow-hidden"
                style={{ background: station.artwork_url ? undefined : GRADIENTS[i % GRADIENTS.length] }}
              >
                {station.artwork_url ? (
                  <img src={station.artwork_url} alt={station.name} className="size-full object-cover" />
                ) : (
                  "♫"
                )}
              </div>
              <LiveBadge />
            </div>
            <div className="text-[15px] font-medium text-text-secondary mb-1">
              {station.name}
            </div>
            <div className="text-xs text-text-muted mb-3">{station.genre || "Live"}</div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-text-faint">Tune in</span>
              <Equalizer />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
