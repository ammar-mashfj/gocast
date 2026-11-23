import { cn } from "@/lib/utils"

/**
 * The AI page's centrepiece: AutoDJ's shuffle as a deck of cards. Played
 * tracks are spent, the one on air glows, the rest wait their turn; nothing
 * is dealt twice until the deck is through (useLibrary: "shuffled, every
 * track once per pass"). Static, with a seeded pattern so it renders the
 * same on server and client.
 */

const COLS = 20
const ROWS = 6
const N = COLS * ROWS
const NOW = 47

// A fixed scatter: a seeded Fisher–Yates shuffle (same on server and
// client), so the deck looks dealt at random rather than striped. The first
// NOW cards of the shuffle are played; card NOW is on air.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const ORDER = (() => {
  const rnd = seeded(7)
  const a = Array.from({ length: N }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
})()
const POS = new Map(ORDER.map((card, pos) => [card, pos]))

export function ShuffleDeck() {
  return (
    <figure className="flex flex-col gap-6 rounded-card bg-card p-5 sm:p-8">
      <div
        aria-hidden
        className="grid gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: N }, (_, i) => {
          const pos = POS.get(i) ?? 0
          const now = pos === NOW
          return (
            <span
              key={i}
              className={cn(
                "aspect-[3/4] rounded-[3px] sm:rounded-xs",
                now ? "bg-on-air shadow-[0_0_0_2px_var(--color-on-air),0_0_18px_var(--color-on-air)]" : pos < NOW ? "border border-surface-strong" : "bg-on-air/40",
              )}
            />
          )
        })}
      </div>
      <figcaption className="grid gap-4 sm:grid-cols-3">
        <Key swatch="border border-surface-strong" title="47 played" body="Spent for this pass. None of them comes back until the rest have played." />
        <Key swatch="bg-on-air" title="1 on air" body="Dealt at random from what’s left, never the one that just played." />
        <Key swatch="bg-on-air/40" title="72 to go" body="Then the deck reshuffles and a new pass begins." />
      </figcaption>
    </figure>
  )
}

function Key({ swatch, title, body }: { swatch: string; title: string; body: string }) {
  return (
    <div className="grid grid-cols-[0.875rem_minmax(0,1fr)] gap-x-3 gap-y-1">
      <span className={cn("mt-1.5 aspect-[3/4] w-3.5 rounded-[3px]", swatch)} />
      <span className="font-display text-heading">{title}</span>
      <span className="col-start-2 text-body-sm text-muted-foreground text-pretty">{body}</span>
    </div>
  )
}
