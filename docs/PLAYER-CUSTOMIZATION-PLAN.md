# Player page customization — assessment

**Date:** 2026-09-15
**Status:** Assessment only. Nothing built, nothing decided.

The idea as proposed: let owners change how the public player page looks —
3 free templates, more for Pro, plus text customization and offer links for
monetization.

The short version: that is **three separate features wearing one coat**, with
very different value-to-cost ratios. Two are worth building. One is a trap.

---

## What already exists

The database half was scaffolded once and abandoned.

| Thing | Where | State |
|---|---|---|
| `theme_config` column | `api/database/migrations/2026_04_03_193133_create_stations_table.php:27` | exists, nullable json |
| `social_links` column | same migration, `:26` | exists, nullable json |
| Array casts | `api/app/Models/Station.php:184-185` | wired |
| Validation | `api/app/Http/Requests/UpdateStationRequest.php:43-44` | `['nullable', 'array']` — no shape, no allowlist |
| Public exposure | `api/app/Http/Resources/StationResource.php:175-176` | both fields, on the **public** payload |
| TS interface | `client/interfaces/Station.ts:113-114` | declared |
| Any code that reads them | — | **none** |

Two consequences:

1. Validation is a bare `array`. Fine for a dead column; **not** fine the
   moment its contents render on a public page.
2. Both fields sit on the public resource, so anything stored is world-readable
   via `/public/stations/{slug}` whether or not the UI shows it.

## The rendering surface

- `client/app/station/[slug]/PlayerView.tsx` — 1,089 lines, the real player.
- `client/app/station/[slug]/PlayerSkeleton.tsx` — 57 lines, must structurally
  match PlayerView or the loading state pops.
- `client/app/embed/[slug]/EmbedPlayer.tsx` — 163 lines, a **separate**
  implementation. Shares only the hooks (`useStreamPlayback`,
  `useListenerSession`), not the markup.

So there are already two independent player renderers to keep in sync.

Good news for theming: PlayerView is almost entirely semantic Tailwind tokens
(`text-foreground`, `text-muted-foreground`). Hardcoded values are rare —
`#161228` / `#2a2344` at `PlayerView.tsx:314`, plus `violet-300`, `red-500`,
`emerald-500`. A color theme is close to a CSS-variable swap.

## Plan gating pattern

Plan features are flat columns on `plans` (`api/app/Models/Plan.php:14-22`):
`max_stations`, `max_running_stations`, `max_listeners`, `autodj_enabled`,
`analytics_days`, `embed_enabled`, `watermark_enabled`.

A theming gate is one more column beside `embed_enabled`. No new machinery.

---

## The three ideas, ranked

### 1. Offer links / monetization — build this first

The most valuable piece, and it was last in the sentence. A "Support the
station / Buy the album / Tip jar" block is a **revenue reason** to upgrade,
not a cosmetic one.

It fits the Pro story already being sold in
`client/components/homepage/PricingSection.tsx:19-23` — encoders, TuneIn,
custom domain, analytics: all reach-and-business, zero cosmetics. A
broadcaster pays $15/mo to make money, not to pick teal.

Smallest build of the three: label + URL + optional emphasis. That is
`social_links` with one more field.

### 2. Theming (colors, fonts, text) — cheap, worth it

Mostly a CSS-variable swap given how tokenized PlayerView already is. Low cost,
high perceived value.

### 3. Three template *layouts* — don't

This is the part to push back on.

Three layouts turns two player implementations into six-plus, and "more
templates for Pro" means that number only ever grows. Every future player
feature — volume control, share buttons, `ScheduleBlock`, `RelatedStations`,
now-playing history — gets built N times or silently degrades in N−1 of them.

---

## Recommended shape

**One layout. Themeable tokens. Plus a content block.**

Tier **presets, not layouts**: 3 free palettes, more + custom hex for Pro.
Presets are data; layouts are code. Same "Pro gets more" story, none of the
maintenance fan-out.

---

## Decide before writing code

- **Strict validation.** Free-form array → public page needs a key allowlist
  and per-key format checks (hex-only colors, enum fonts). Not
  `nullable|array`.
- **Link safety.** Scheme validation (block `javascript:`),
  `rel="nofollow noopener"`.
- **Link policy** — the non-technical one. Hosting monetization links makes
  GoCast the host of whatever people link to: affiliate spam, scams, adult.
  Worth a stance now rather than after.
- **Brand tension.** The audible watermark and "powered by GoCast" ID stop
  working as distribution if pages no longer look like GoCast. Defensible
  trade, but make it deliberately.
- **Copy conflict.** The homepage headline is literally "Free is the whole
  product" (`PricingSection.tsx:34`). Withholding *cosmetics* undercuts that;
  withholding *monetization tools* doesn't. Another reason to lead with offer
  links.
- **Embed must inherit the theme**, or a Pro user's themed page and their embed
  won't match. Convenient that embed is already Pro-only.
