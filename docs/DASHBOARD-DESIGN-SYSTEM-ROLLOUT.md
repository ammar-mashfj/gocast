# Dashboard → GoCast Design System rollout

Applying the Claude Design project **GoCast Design System**
(claude.ai/design/p/78b1a8cf-1b5f-4cb2-b7e0-73dfd000e700) to the web dashboard,
one step at a time. Setup first, then page by page, each page reviewed in the
browser before the next one starts.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done and reviewed

## Source of truth

- Design system files: `tokens/colors.css`, `tokens/typography.css`,
  `tokens/spacing.css`, `tokens/fonts.css`, `components/**`, `guidelines/**`.
  Same palette as `mobile/src/lib/theme.ts`.
- Scope: `/dashboard/**` only. Marketing shares `client/app/globals.css` and
  must keep its current look.
- Desktop adaptation: keep the sidebar and wide layouts. Colours, type, radii,
  status lamps and component styling carry over; phone-only patterns
  (bottom TabBar, full-width 64px CTAs, Focus mode) don't.

## Decisions to settle before setup

- [x] **Colour meaning.** Adopt the design system's rule (decided 2026-10-01):
      red `#FF5A4E` = live / mic open, violet = AutoDJ, amber = silence / Pro,
      green = OK, grey = off air. No separate mic hue: sky blue goes, mic open
      is red. Replaces web `DESIGN.md`'s green = live, sky = mic, red = fault.
- [x] **Faults → amber** (decided 2026-10-01): the design system's "silence /
      nothing going out" colour. Shares the hue with Pro; Pro shows as a badge,
      faults as messages.
- [x] **Destructive → live red, as the design system does it** (decided
      2026-10-01). Sheet spec: "End the broadcast?" → `<Button variant="live">`.
      The mobile app does the same for Delete tracks, Delete slot and "End and
      sign out". Pattern: solid red `#FF5A4E` button with dark ink `#1A0806`,
      always inside a confirm dialog, paired with a subtle cancel that names
      what you keep ("Keep going", "Keep them"). Field errors: red 1.5px border
      (TextField), error text `--text-error #FF8177`. Crimson `#f0506e` is not
      used.
- [x] **Fonts → design system** (decided 2026-10-01): Bricolage Grotesque for
      everything, IBM Plex Mono for clocks / counters / status labels, IBM Plex
      Sans (+ Arabic) as the fallback for non-Latin titles. Marketing keeps
      Onest.
- [x] **Sizing → scaled for desktop** (decided 2026-10-01): same generous-radius
      feel a step down: ~12px controls, 40–44px buttons, 18–22px cards. The
      52–64px sizes are phone thumb targets.
- [x] **`DESIGN.md`.** Done in step 0c.

## To change in the design system (Claude Design project)

Web decisions Ammar approved that the GoCast Design System doesn't have yet.
Update the project (claude.ai/design/p/78b1a8cf-1b5f-4cb2-b7e0-73dfd000e700)
so web and mobile stay one system:

- [ ] **Talk pad grille** — speaker-grille dot pattern on the talk pad (9px
      grid; warm grey 7.5% idle, ink 16% on red). Exception to "backgrounds
      are solid". Also the idle "● LIVE WHILE HELD" marker in the trailing
      slot, and the title "Hold here to talk". (TalkPad component + readme
      "Backgrounds" line.)

## Phase 0 — Setup

### Step 0a — Foundation (tokens, fonts, sizing) `[~]` built, awaiting review

- [x] Dashboard-only scope: `data-surface="dashboard"` on the dashboard's
      `SidebarProvider`; `.dark:has([data-surface="dashboard"])` in
      `globals.css` lifts it to `<html>` so portals follow
- [x] Colour tokens: every brand + state `@theme` colour now reads a `--ds-*`
      variable with the marketing value as fallback; the dashboard block sets
      them. New tokens: `live-ink`, `live-tint`, `on-air-text`, `on-air-tint`,
      `pro-ink`, `pro-tint`, `fault-tint`, `ok`, `ok-text`
- [x] shadcn neutrals remapped to the warm ladder; primary = off-white with
      dark ink; destructive = live red
- [x] Fonts: Bricolage for body inside the dashboard, IBM Plex Mono
      (`--font-plex-mono`, not preloaded) for mono
- [x] Radius base 12px (controls 12, cards ~22)
- [x] Selection, caret, focus ring, scrollbar colours
- Known interim look until 0b / pages: text on solid red / amber fills is
  still white in places (needs `text-live-ink`); headings don't yet use the
  800 weight + tight tracking; control heights unchanged.
- Deferred: IBM Plex Sans Arabic fallback for non-Latin titles (the system
  font covers Arabic meanwhile).

### Step 0b — Shared components `[~]` built, awaiting review

How: shared primitives are also used by marketing / auth, so their
dashboard styling is either a `ds:` class (new `@custom-variant ds` in
`globals.css`, dashboard only, outranks `dark:`) or a CSS variable the
dashboard sets (`--btn-h`, `--field-h`, `--control-radius`, `--chip-radius`,
`--card-radius`, `--card-ring`) with the old value as fallback. Sizes use
variables so a call site's own `h-11` / `rounded-full` still wins.

- [x] Button: primary off-white + ink; outline = design-system ghost (1.5px 14%
      hairline); secondary = subtle (8% off-white); destructive = live red +
      dark ink; new variants `live`, `on-air`, `pro`; bold labels; press =
      scale .98; 40 / 44px; 12px corners
- [x] Input, textarea, select: 40px, 12px corners
- [x] Card: borderless, ~22px corners; titles bold
- [x] Badge: 8px chip corners; Pro = solid amber, dark ink, mono caps
- [x] Dialog / sheet: 60% scrim, no ring, sheet shadow, ~22px corners;
      titles extra-bold, tight tracking
- [x] Switch: 40×24, live red when on with dark-ink knob (as the design system
      and the mobile app draw it)
- [x] Confirm dialog: cancel is the subtle button. Call sites still say
      "Cancel": rename to "Keep …" page by page
- Unchanged, already token-driven: dropdown menu, popover, tooltip, toasts
- Page-local, done with their pages: segmented controls (MicSettings,
  DayList, SlotPanel, go-live bitrate picker)

### Step 0c — Status lamp and chrome `[~]` built, awaiting review

- [x] Lamp palette (`SIGNAL_TONE` in `components/studio/signal.ts`, shared by
      the studio `OnAirLamp`, the `LiveBanner` and the go-live lamp), per the
      prototype's studio band — no edges, the fill carries the state:
      LIVE · MIC = red tint `#3A1714` + pale-red message `#FFB3AC`;
      LIVE (music) = dim band `#221A18` + muted grey message; SILENCE and the
      other faults = amber tint `#33260F` + pale-amber message; idle = card.
      Chip red / amber with dark ink, mono 700 caps (`LAMP_LABEL`).
      New tokens `live-dim`, `live-soft`
- [x] Studio band is a card like mobile's `Band.tsx`: inset, 24px corners,
      its own fill; chip + mono uptime (+ web-only kbps / audio lost) on row
      one, message + mono "N listening" on row two
- [x] End in the band, and the queue-aware silence copy — done in page 2
- [x] Mic state label "Mic open" → "Live · Mic" (lamp and mini controller)
- [x] Mini controller: red edge and icon while the mic is open, warm hairline
      otherwise, mono state label
- [x] Live banner rebuilt to match mobile's `LiveStrip` exactly (decided
      2026-10-01): solid red inset bar, mono LIVE + uptime + "Back to studio";
      solid amber RECONNECTING while the socket is down. No message, no fault
      states, no Mic off button — those live in the studio band only
- [x] Sidebar: type wordmark (Go / Cast violet / .fm) instead of the old
      violet logo; mono LIVE marker; plan card borderless on a card fill with
      a subtle "Request Pro" button
- [x] Header hairline on the warm border token
- [x] `DESIGN.md`: dashboard subsections under Colors and Typography, the
      overview's lamp description, and a note that the design system's colour
      rule replaces the old named rules inside the dashboard

## Phase 1 — Pages

Each page: swap hard-coded colours (`emerald-*`, `sky-*`, `white/…`, raw hex,
`violet-*` brand classes) for tokens, match component styling, check copy
against the design system's voice, then review in the browser.

| # | Page | Route | File | Status |
|---|------|-------|------|--------|
| 1 | Station overview | `/dashboard/stations/[slug]` | `app/dashboard/stations/[slug]/(overview)/page.tsx` | [~] built, awaiting review |
| 2 | Studio | `/dashboard/stations/[slug]/studio` | `app/dashboard/stations/[slug]/studio/page.tsx` | [~] built, awaiting review |
| 3 | Go live (pre-flight) | `/dashboard/stations/[slug]/live` | `app/dashboard/stations/[slug]/live/page.tsx` | [~] built, awaiting review |
| 4 | Library | `/dashboard/stations/[slug]/library` | `app/dashboard/stations/[slug]/library/page.tsx` | [~] built, awaiting review |
| 5 | Schedule | `/dashboard/stations/[slug]/schedule` | `app/dashboard/stations/[slug]/schedule/page.tsx` | [~] built, awaiting review |
| 6 | Audience | `/dashboard/stations/[slug]/audience` | `app/dashboard/stations/[slug]/audience/page.tsx` | [~] built, awaiting review |
| 7 | Station settings | `/dashboard/stations/[slug]/settings` | `app/dashboard/stations/[slug]/settings/page.tsx` | [~] built, awaiting review |
| 8 | Broadcasts | `/dashboard/broadcasts` | `app/dashboard/broadcasts/page.tsx` | [~] built, awaiting review |
| 9 | Account settings | `/dashboard/settings` | `app/dashboard/settings/page.tsx` | [~] built, awaiting review |
| 10 | No station yet (create) | `/dashboard` | `app/dashboard/page.tsx` | [~] built, awaiting review |

### Page 1 — Station overview (built 2026-10-01, awaiting review)

Modelled on the mobile Overview (`mobile/src/components/station/overview.tsx`):
a stack of borderless cards on the ground instead of a flat `.sheet`.

- Control panel = mobile's hero: fill follows the state — solid red with
  dark ink while someone is live (`.surface-live` re-points the tokens so
  everything on it turns ink; buttons become ink with red text), AutoDJ
  violet tint on air, amber tint for no sound / not reaching listeners,
  plain card otherwise. 24px corners, no border or shadow.
- State label is the design system's StatusLamp dot variant: mono caps word
  after a dot, no pill. The big line is 800 weight.
- Buttons as on mobile: **Go live** leads in every state (primary, red dot);
  **Start AutoDJ** is the violet outline under it; **Turn station off** is a
  quiet ghost button. (Off air, Start AutoDJ used to lead.)
- "Now playing" / "Listening now" / stat labels: mono caps, faint. AutoDJ
  track progress bar violet; its times mono.
- "Your link" card replaces the share bar: title, link in an inset well, the
  same Copy / Tune-in code / Embed buttons, and "Listeners open it in any
  browser. No app, no account." under them.
- Broadcast activity: StatTile-style numbers; the show-end card borderless.
- Station artwork placeholder: the design system's stripes (dashboard only).
- Station name: 800 weight, tight tracking.
- Loading skeleton follows the same card geometry.
- Left as is: the QR code keeps its print violet `#4c1d95` (it must scan).

### Page 2 — Studio (built 2026-10-01, awaiting review)

Rebuilt as the mobile studio (`mobile/src/components/studio/OnAir.tsx`,
`Band.tsx`, `Console.tsx`), laid out for a desktop: cards on the page.

- **Band** (`OnAirLamp`): mobile's band card, now with **End** inside it
  (subtle "End", same confirm dialog). End is gone from the right rail and
  the compact bar. Messages in mobile's words: live mic "You're talking.
  Music dips under you. Let go to close.", latched "Mic stays open. Switch
  off Keep mic open (L) to close.", silence depends on the queue ("Nothing
  is going out. Press play (K) or hold Space to talk." / "…Add music or…").
- **Now playing** card (`OnAirDeck` → `NowPlaying`): title + artist, time
  LEFT in mono 26 (amber under 15s, bumps at the 20s / 10s talk-up cues),
  off-white progress bar, then NEXT well + count, previous, next, and the
  off-white play button. The ring dial (`TrackDial`) and the "3m until it
  restarts" line are gone, as on mobile.
- **Talk pad** (`PushToTalk`): one big card that is the button; "Hold to
  talk" / "You're on" / "Mic open" at 34px 800; turns solid red with dark
  ink while open; the level meter sits inside it (`MicMeter`: 30 segments,
  green → amber → red on the dark pad, ink on the red one). Music-only shows
  get a dimmed "Music only" pad instead of nothing.
- **Controls row** (new `StudioControls`): Keep mic open (switch card),
  Monitor (off-white when on) with its volume slider — web only — and the
  mic settings square. `MonitorBar` deleted; mic settings uses the design
  system's segmented control.
- **Running order** (`FileQueue`): a card; segmented Repeat list / Repeat
  track; "PLAYING" in mono caps; hairlines on the warm border.
- **Right rail** (`StreamPanel`): a column of cards on the page instead of
  the old violet-black strip; "Listening now" 800 weight; "Your link".
- Go-live page's mic check uses the new meter colours too.
- Follow-ups for Phase 2: the help article `using-the-studio` still says
  "Mic off" and describes the old console; `DESIGN.md`'s TrackDial /
  MicMeter / PushToTalk component notes are out of date.

### Page 3 — Go live (built 2026-10-01, awaiting review)

Restyled to the mobile pre-flight (`mobile/src/app/live/[slug].tsx`,
`components/live/parts.tsx`); the web flow (pre-flight → Ready → connecting)
is unchanged.

- Headings 34px / 800: "Ready to go live on {station}?" (the station name is
  no longer violet — violet is AutoDJ), "Ready when you are.".
- Mic + music / Music only and Pick up / Start over: mobile's Mode cards —
  the chosen one off-white with dark ink and a radio dot.
- Checks and connecting steps: a card of rows with mobile's glyphs — green ✓
  passed, amber ✕ failed, grey pending / spinner.
- **Go live now**: the live-red 64px button with a dot — the one red button
  before the show.
- AutoDJ-on-air note: violet dot + muted line, no tinted box.
- Already live, mic blocked: amber notice cards (mobile's Notice).
- Saved-queue and link wells on the page colour; mic check meter as studio.

### Page 4 — Library (built 2026-10-01, awaiting review)

Web structure kept (rail + track table, far richer than mobile's list);
mobile Library's card language applied (`mobile/src/app/station/[slug]/library.tsx`).

- No `.sheet`: the track table is a borderless card (edge only while files
  are dragged in); heading "AutoDJ" 34px / 800.
- Storage bar violet like mobile's, red from 95% (was cream / white).
- Playlist rail: 44px rounded items, the open one on a card fill; mono caps
  group labels; mono track/duration details.
- Pro upsell: a card with mobile's amber mono "PRO" label, 800 title, and the
  amber **Request Pro** button (pro variant); "Request sent" in green.
- Leftover raw whites / violets in playlist badge, tag chip and jingles drop
  zone moved to tokens. Loading skeleton follows.

### Page 5 — Schedule (built 2026-10-01, awaiting review)

- Week grid swatches: the four playlist shades are now the design system's
  own violets (`#2B2540`, `#9B7BFF`, `#C9B8FF`, `#3A3350` — mobile's
  autodjArtA / autodj / autodjText / autodjDim) instead of Tailwind
  violet/indigo. Kept one hue on purpose: every slot is AutoDJ. (Mobile's
  editor tells playlists apart with amber / violet / green / red swatches,
  which breaks the colour rule; the web doesn't copy that.)
- Grid rows sit on the page colour inside a borderless card; hairlines warm.
- Status pill = the design system's solid StatusLamp (dark ink on red /
  violet / amber).
- Day chips filled like mobile's day picker (red for show times, violet for
  AutoDJ) — they were tints.
- Slot panel, phone day list and the sticky save bar on cards; heading
  34px / 800. No `.sheet`.

### Page 6 — Audience (built 2026-10-01, awaiting review)

- No `.sheet sheet-rules`: chart, breakdowns and "How we count" are cards.
- Chart bars as the mobile Audience tab / design system draw them: past days
  AutoDJ's dim violet `#3A3350`, today (or the hovered day) violet. This
  reverses the 2026-09-26 "neutral audience bars" critique fix — mobile and
  the design system use violet here.
- Range picker = the design system's Segmented (card track, chosen range
  off-white, mono). Headline figures = StatTile (mono caps label, 26px bold).
- Breakdown bars: off-white on the page colour.
- Pro upsell: card, amber mono "PRO", amber **Request Pro** (was
  "Upgrade to Pro" in a cream button).
- New tokens `on-air-dim` / `on-air-deep` (also used by the schedule grid).

### Page 7 — Station settings (built 2026-10-01, awaiting review)

- No `.sheet sheet-rules`: Details, Links, Show times, Stream, Encoder and
  Delete are cards; heading 34px / 800; station name bold.
- Stream facts: mono caps labels, mono values.
- Delete row: a plain card, "**Delete this station** — permanently, with all
  its data" (the red "Danger zone" label would now read amber = warning).
  Trigger stays outline; the confirm is the red button, cancel "Keep
  station" subtle.
- Show-time list hairlines on the warm border token.

### Page 8 — Broadcasts (built 2026-10-01, awaiting review)

- No `.sheet`; heading 34px / 800 (also on the empty state).
- "Last show" card as StatTiles: mono caps labels; On air and Peak
  listeners at 26px bold.
- Show-length bars as mobile's Recent shows: solid live red on the dark
  track, 5px. Row hairlines on the warm border token.

### Page 9 — Account settings (built 2026-10-01, awaiting review)

- Same fix as station settings: no `.sheet`, and no 768px cap — two columns
  from xl (Plan + Profile left, Password + Delete account right).
- Heading "Account" 34px / 800; plan name 800.
- **Request Pro** is the amber pro button (was outline).
- "Danger zone" (red, warning icon) → plain "Delete account" card; the
  confirm's cancel reads "Keep my account" (subtle), the red button stays
  the confirm.

### Page 10 — Create your station (built 2026-10-01, awaiting review)

- Heading 38px / 800; the "what happens next" note is a card instead of a
  hairline-topped paragraph; Create station is the large (44px) primary.
- Also the dashboard error page: heading 34px / 800, support details in a card.

### Leftover scan (2026-10-01)

Dashboard, `components/dashboard`, `components/studio`, `components/ui`:
no raw Tailwind palette colours or hex left except deliberate ones —
`text-violet-muted` links (a token; resolves to the design system's link
violet `#C9B8FF` in the dashboard), the QR code's print violet, MicMeter's
canvas colours (hex by necessity, from the design system), the mini
controller's floating shadow. Fixed in the scan: the encoder "off air" box
in the go-live dialog (`GoLiveTrigger`). `TrustCues` (green checks) is
marketing / sign-up only, out of scope.

Redirect-only routes, nothing to style: `/dashboard/stations`,
`/dashboard/library`, `/dashboard/station/[[...path]]`.

## Phase 2 — Wrap-up

- [ ] Search for leftover raw colours under `app/dashboard` and `components/`
- [ ] Marketing pages unchanged (spot-check home, pricing, help)
- [ ] `DESIGN.md` updated
- [ ] Help screenshots flagged for reshoot

## Log

- 2026-10-01 — Design system read and compared with the dashboard; tracker created.
- 2026-10-01 — Decided: red = live / mic open; faults amber; destructive = live red in a confirm (as the design system and mobile do); design-system fonts; desktop-scaled sizing.
- 2026-10-01 — Step 0a built (globals.css, app/layout.tsx, dashboard/layout.tsx).
- 2026-10-01 — Step 0b built (components/ui: button, input, textarea, select, card, badge, dialog, sheet, switch, use-confirm).
- 2026-10-01 — Step 0c built (lamp palette + label, sidebar, header, live banner, mini controller, DESIGN.md).
- 2026-10-01 — Lamp corrected after review: LIVE, LIVE · MIC and SILENCE are three different bands, not one red with a stronger edge.
- 2026-10-01 — Live banner rebuilt as mobile's LiveStrip (Ammar: "match mobile").
- 2026-10-01 — Studio lamp rebuilt as mobile's band card (Ammar: it must be a card, not blended into the page).
- 2026-10-01 — Ammar reviewed the studio band card: "not good" yet. Deferred to the Studio page step, where it gets a full pass against mobile's Band.tsx.
- 2026-10-01 — Page 1 (overview) built.
- 2026-10-01 — Page 2 (studio) built. MonitorBar.tsx and TrackDial.tsx deleted (unused).
- 2026-10-01 — Studio spacing fixed after review: one 16px edge + 10px gap everywhere (band included), running order floor 300→180px so the column fits without a scrollbar.
- 2026-10-01 — Studio talk area split in two after review: the hold pad (button, red while open, no focus outline while pressed) and a separate Mic check card (meter + device name) beside it from 42rem of deck width; MicMeter gains `onRed`.
- 2026-10-01 — Talk pad: title "Hold here to talk"; idle marker "● LIVE WHILE HELD" (red dot, mono caps) in the design system's trailing slot; faint red inner edge on hover. Card stays plain otherwise — red fills it only while open.
- 2026-10-01 — Talk pad gets a speaker-grille dot pattern (9px grid; warm grey 7.5% idle, ink 16% on red). Deliberate exception to the design system's solid-surfaces rule, at Ammar's request; the only patterned surface in the dashboard.
- 2026-10-01 — Page 3 (go live) built.
- 2026-10-01 — Page 4 (library) built.
- 2026-10-01 — Page 5 (schedule) built.
- 2026-10-01 — Page 6 (audience) built.
- 2026-10-01 — Page 7 (station settings) built.
- 2026-10-01 — Station settings widened after review: the 768px cap left half the screen empty once sections became cards; now two columns from xl (listener-facing left, stream/encoder/delete right).
- 2026-10-01 — Ammar: station settings "needs some fix" (unspecified) — revisit before closing page 7.
- 2026-10-01 — Page 8 (broadcasts) built.
- 2026-10-01 — Page 9 (account) built.
- 2026-10-01 — Page 10 (create station) + dashboard error page built; leftover scan done.
