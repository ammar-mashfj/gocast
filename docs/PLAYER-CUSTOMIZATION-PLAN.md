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

---

# Ads on the free player page — assessment

**Date:** 2026-09-15
**Verdict:** Not worth it at current scale. A better ad slot already exists,
built and empty.

## There is already an ad slot, and it is inert

`api/app/Notifications/ProAccessGranted.php:25-26` states it directly:

> The watermark is likewise not a real difference today: no clips are
> installed, so it is inert on every plan.

The mechanism is fully wired — `api/app/Jobs/ReloadWatermarkClips.php`, a
`watermark` Liquidsoap source (`LIQ_SOURCE = 'watermark'`), and
`api/app/Observers/UserObserver.php:95-105` pushing plan changes to running
stations so the spot stops the instant someone upgrades. It is an audio spot on
every free stream, with no clip in it.

Strictly better than display ads: no consent banner, no network approval, no
layout cost, and it reaches *listeners* — people already listening to internet
radio, the best possible audience for "start your own station."

## Why display ads lose at this scale

- **The revenue isn't there.** Display RPMs on a niche audio page run roughly
  $0.50–$2. Even at the top of that, clearing the price of **one $15 Pro
  subscriber** needs tens of thousands of monthly pageviews. Invite-seeding is
  nowhere near. Realistically single-digit dollars a month.
- **Approval is unlikely anyway.** A player page is thin content for AdSense
  review, and the networks worth having (Mediavine, Raptive) gate at 50k–100k
  monthly sessions.
- **It fights the customization investment.** The point of theming and links is
  that broadcasters make the page theirs and share it. Ads make it less theirs
  and less shareable. The two roadmap items cancel.
- **Real technical cost on a latency-sensitive page.**
  `client/app/station/[slug]/PlayerSkeleton.tsx` exists *because* the hls.js
  dynamic import causes layout pop — that is how tight the budget already is.
  Ad slots add CLS and a third-party script racing stream setup.
- **Third-party cookies mean a consent banner**, on the one page whose entire
  job is "press play." Country-level analytics means EU traffic is real.
- **It is a churn signal to broadcasters.** "My host puts ads on my station
  page" is a reason to leave. Losing one Pro-intent broadcaster costs more than
  a year of the ad revenue.

## Do instead

1. **Fill the watermark slot.** Built and empty. Per the same comment, Pro's
   real differentiation today is only AutoDJ + the listener cap — thin. A
   free-tier audio ID both markets GoCast *and* makes Pro worth paying for.
   Same effort as ads, better on both axes.
2. **House promo on free station pages** — "Broadcast your own, free." No
   consent banner, no approval, pure acquisition.
3. **Let broadcasters monetize instead of taxing them** — the offer-links
   block. Aligns GoCast with them rather than against.

## When ads would make sense

When a single station reliably pulls tens of thousands of monthly listens. At
that point the thing worth selling is not display but **audio spots inserted
into the stream** — which Liquidsoap can already do, being the same mechanism
as the watermark and jingles — and which are worth many times a banner. It
should be revenue-share with the broadcaster, not a unilateral tax.

That is a 2027 conversation. Today it would cost page weight, consent friction,
and goodwill to earn less than one subscription.
