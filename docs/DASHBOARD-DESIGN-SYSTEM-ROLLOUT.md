# Dashboard → GoCast Design System rollout

Applying the Claude Design project **GoCast Design System**
(claude.ai/design/p/78b1a8cf-1b5f-4cb2-b7e0-73dfd000e700) to the web dashboard,
one step at a time. Setup first, then page by page, each page reviewed in the
browser before the next one starts.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done and reviewed

## Round 2 — rebuild against the dashboard prototype (from 2026-10-01)

Round 1 (below, checkpointed as `f6a201c`) restyled every page in place, so the
design system's patterns were rebuilt inline on each page — 18 copies of the
display heading, 27 mono caps labels, 69 hand-tuned `tracking-[…]` values.
Round 2 rebuilds the dashboard against Ammar's prototype
(claude.ai/artifact/25cb6NerCjXnL96wrNsG64; unpacked spec in
`docs/design/dashboard-prototype/` — `markup.html`, `logic.jsx` with the
per-page review notes, `styles.css` with the design-system tokens) on a
reusable component layer.

Rules:

- **Feature differences are decided one by one.** Where the prototype drops
  something we have, or shows something we don't have (or have no data
  for), list it per page and get Ammar's call before building. Record each
  decision under the page.
- **Pages hold layout and data, never styling decisions.** Type, surfaces and
  states come from utilities and `components/ds/`.
- **Every page, dialog and confirmation** is reviewed by Ammar in his browser
  at desktop, tablet (~820px) and phone (~390px) before the next starts.
  Tests for each component's states and each page's behaviour.

Order:

| # | Step | Status |
|---|------|--------|
| R0 | Checkpoint commit + spec in repo | [x] `f6a201c` |
| R1 | Type / surface utilities (`text-display`, `text-eyebrow`, `surface-*` …), font check | [x] reviewed 2026-10-01 |
| R2 | Shell: sidebar, top bar, status band, one shared station-status source | [x] reviewed 2026-10-01 |
| R3 | Dialogs, sheets, confirms, menus, popovers, toasts | [x] reviewed 2026-10-01 |
| R4 | `components/ds/` primitives as pages need them, with a dev-only gallery | [x] reviewed 2026-10-01 |
| R5 | Pages: Overview → Studio + Go live → AutoDJ → Schedule → Audience → Your shows → Station settings → Account → Create station | [x] all pages reviewed |
| R6 | Guardrails: lint ban on arbitrary values / raw palette in dashboard code, Playwright screenshots per page × state | [~] 6.1–6.3 reviewed; 6.4 docs built, awaiting review |

### Architecture (2026-10-01)

- **`components/ds/` is the dashboard's component layer**, built to the
  prototype with `cva` variants and the R1 tokens — no `ds:` overrides.
  `components/ui/` goes back to being marketing / auth shadcn: its round-1
  `ds:` classes and `--btn-h`-style variables stay only until the last
  dashboard page imports from `ds/`, then they are removed (R6), and a lint
  rule stops dashboard code importing `components/ui` directly.
- **Station state has one source**: a provider in the dashboard layout
  owns the status poll and derives the band / lamp / hero state as a pure,
  unit-tested function. Today each consumer runs its own `useStationStatus`
  poll.
- **Sizes follow the prototype, not round 1's scaled-down ones**: cards
  26px corners / 24px padding, panels 22, buttons 40px (14px corners) with
  52 / 58 / 64px large sizes for hero actions.

### R1 — tokens and fonts (built 2026-10-01, awaiting review)

- `app/dashboard.css` (new, imported by `globals.css`): the dashboard scope
  block and `.surface-live` moved out of `globals.css` unchanged, plus theme
  tokens — type `text-hero / page / display / title-lg / title / title-sm /
  heading / lead / body / body-sm / caption / meter-sm / meter / meter-lg /
  meter-xl` (size + line height + tracking + weight in one class; hero, page,
  display and meter-xl scale down on phones), `eyebrow` / `eyebrow-sm` (mono
  caps labels), radii `rounded-hero / card / panel / well / button / control /
  item / chip / tag`, surfaces `bg-surface-inset / raised / control /
  strong`, hairlines `border-line / line-strong`.
- `lib/utils.ts`: those names registered with tailwind-merge (otherwise
  `cn("text-display", "text-foreground")` drops one).
- Fonts: IBM Plex Sans Arabic as the dashboard's fallback for Arabic names
  and titles (loads only when Arabic text is on screen).
- Tests: Vitest + Testing Library added (`npm test`, colocated
  `*.test.ts(x)`); first test pins the tailwind-merge registration. Vitest 4,
  not 5 (5 needs `@types/node` ≥ 22; the project is on 20).
- Expected visual change: none, except Arabic text in the dashboard now
  renders in Plex Sans Arabic instead of the system font.

### R6.4 — Docs and help screenshots (built 2026-10-01, awaiting review)

- **DESIGN.md:** a new closing chapter, "The dashboard (GoCast Design
  System)" — colour (warm ladder, state hues, error red for permanent
  deletes, the status band), the type and radius token tables, stroke /
  shadow / page / grille, the shell, every `components/ds` part, and the
  rules (tokens only, no JSX entities, one off-white action, phones,
  voice, motion, how to check a change). Every older dashboard passage was
  removed: OnAirLamp, LiveBanner + mini controller, OnAirDeck, TrackDial,
  MicMeter, PushToTalk, FileQueue, EndBroadcast, ShowSignOff, StationPower,
  the mic-sky colour, the dashboard YAML tokens (lamp chips, push-to-talk,
  console clock, studio rail). The rest now reads as marketing + public
  player.
- **Feature docs:** 0 broken. Updated and re-stamped 21, among them
  station-management-dashboard (largely rewritten), web-shared-frontend,
  broadcasting-web-studio, schedule, listener-analytics, api-reference,
  data-model, dev-environment-and-testing. Still stale and untouched (their
  sources changed in other work): admin-panel, deployment-infra,
  liquidsoap-station-script, liquidsoap-supervisor, mobile-app-shell-and-auth,
  mobile-studio-and-encoder, watermark-clips.
- **Help screenshots:** `help-screenshots.spec.ts` now signs in as the
  keeper `shell@gocast.test` (not Ammar's account) and stages only in the
  page. 11 of 13 images retaken; subject changes: station-power = the
  Overview hero, autodj-rotation = Coming up, schedule-on-now = Right now /
  Your next show, schedule-slots = the Edit slot dialog. The two player
  shots are unchanged (public player not redesigned).
- **Help articles fixed to the new UI:** turning-your-station-on-and-off,
  create-your-station (one station per account; the address never changes),
  playlists-and-the-rotation, upload-your-music, schedule-playlists-by-time,
  broadcast-from-butt-or-mixxx, share-your-station, read-your-audience-page,
  your-player-page, go-live-from-your-browser (pre-flight + one press;
  `updated` bumped). Rendered HTML checked for glued words.
- **Playwright:** `grepInvert: /@(screenshots|visual)/` keeps the capture
  specs out of `test:e2e`; `npm run test:visual` and `npm run
  test:help-shots` set `E2E_CAPTURE=1`.
- Known, not fixed: the auth e2e suite targets removed pages and
  `getByLabel("Password")` (strict-mode clash with Show); the "about fourteen
  seconds" delay in two articles predates the harbor buffer cut; the blog's
  schedule post still shows the old editor.

### R6.3 — Visual suite (built 2026-10-01, reviewed)

`client/tests/e2e/dashboard-visual.spec.ts`, run with `npm run test:visual`
(Playwright, tagged `@visual`; reuses the running dev servers). 26 states ×
desktop 1440 and phone 390 = 52 tests, ~1.5 min. Each writes a full-page PNG
to `tests/e2e/.visual/{desktop,phone}/` (git-ignored) and fails on:
an uncaught page error, a missing h1 (or dialog, for dialog states), or a
phone page that scrolls sideways.

Not pixel-diffed on purpose: the pages show live data (the station clock,
"today", counts), so baselines would go stale by the hour.

States: Pro — overview (+ Share, Edit station), studio pre-flight, AutoDJ,
schedule (+ new slot), audience 90d / 7d, Your shows (+ a row opened),
station settings (+ DJ software open, delete confirm), account (+ delete
confirm), the design-system gallery. Free — overview, AutoDJ upsell,
schedule and audience locked, Your shows empty, DJ software locked, account,
Request Pro. No station — create station.

Keeper accounts (all `Password123!`; the suite only reads them):
- `shell@gocast.test` — Pro, `night-shift-shell` (factory) + 3 tracks, two
  playlists, a Wed slot, seeded listener rows (`seed55-*`) and 25 shows.
- `free@gocast.test` — Free, `free-shell` "Morning Static" (factory:
  `php artisan e2e:auth user --email=free@gocast.test`, then
  `Station::factory()->for($user, "user")->create([...])`).
- `create@gocast.test` — Free, no station (don't submit the form).
Never re-run `e2e:auth user` on these: it force-deletes and recreates the
user, and the station with it.

Found by the first run: the Free AutoDJ upsell read "Keep Morning Staticon
air" — `&apos;` in JSX text after `{stationName}` made the compiler drop the
space. Fixed by writing ’; all 27 entities in dashboard JSX replaced, and the
guardrails now forbid entities in JSX text.

### R6.2 — Remove the `ds:` overrides (built 2026-10-01, reviewed)

Decision (Ammar): the two dialogs both surfaces open get a dashboard
version on the ds kit, with the logic in a shared hook; marketing/auth keep
theirs, unchanged.

- `hooks/useAccessRequest` (Request Pro / Custom enquiry rules) — used by
  the marketing `ProAccessDialog` and the new
  `components/dashboard/ProRequestDialog` (ProRequestContext now opens it).
- `hooks/useEmailVerification` (code queueing, sixth digit submits, resend,
  sign out) — used by `components/auth/VerifyEmailDialog` (login/register)
  and the new `components/dashboard/account/VerifyEmailDialog` (Account,
  after an email change). `code-spaced` utility for the code's tracking.
- components/ui button, card, dialog, sheet, badge, input, textarea, select
  restored byte-for-byte to their pre-f6a201c versions: every `ds:` class,
  the round-1 live / on-air / pro button variants (unused outside the
  dashboard) and the `--btn-h` / `--field-h` / `--control-radius` /
  `--chip-radius` / `--card-radius` / `--card-ring` reads are gone. The
  variables and `@custom-variant ds` are removed from the CSS.
- StationArtwork's `ds:text-text-faint` → the four dashboard call sites pass
  `text-text-faint`.
- Marketing and auth render exactly as before: every removed class only
  applied under the dashboard scope, and every variable's fallback was the
  original value.
- Left as is: the phone sidebar drawer (ui/sheet via ui/sidebar) dims the
  page 80%, where ds dialogs dim 60%.

### R6.1 — Lint guardrails (built 2026-10-01, reviewed)

`eslint.config.mjs` → `dashboardGuardrails`, on app/dashboard, components/
dashboard, components/ds and components/studio (tests excluded):
- no arbitrary values for type, colour, radius, tracking, leading, shadow,
  ring or stroke, and no `[Npx]` sizes; layout brackets (grid templates,
  `65ch`, `50vh`, calc + safe-area, flex-basis, transition lists) stay legal;
- no Tailwind default radius steps or palette colours;
- no `components/ui` import except skeleton, sidebar, slider, scroll-area,
  avatar (no kit equivalent).
Proven with a probe file (5 errors on bad classes, none on the legal ones);
the whole client lints clean.

To get there (~70 values):
- New tokens: `text-micro` (11px mono figures), `rounded-segment` (9),
  `rounded-swatch` (4), `border-stroke` (1.5px), `grille` / `grille-live`
  (the talk pad's dot grid, out of four arbitrary bg-[…] classes). All
  registered with tailwind-merge (border-stroke as a border width, grille
  as a bg image).
- Tracking 0.04–0.06em → `tracking-wider`, 0.08–0.1em → `tracking-widest`;
  hand-written 34px titles → `text-display` / `text-page`; default radii →
  the nearest token (lg→chip, xl→item, 2xl→button, 3xl→panel, md→tag).
- shadcn Button / Switch → ds in error.tsx, MicSettings, FileQueue; deleted
  the unused CopyButton.
- Found on the way: the overview's Recent shows printed times on the
  viewer's clock while Your shows uses the station's; both use the station
  clock now.

### R5.9 — Create station + Edit station (built 2026-10-01, reviewed)

The prototype has no create page; its Edit station dialog is the reference.

Decisions (Ammar):
- /dashboard with no station shows the form right on the page (no button
  → dialog). One `StationForm` (components/dashboard/station-form/) drives
  both the create page and `StationFormDialog`, so they can't drift.
- Artwork is the prototype's dashed drop zone: drop or click, preview +
  Remove. `artworkProblem` refuses non PNG/JPEG/WebP and > 5 MB before
  uploading — the copy said 2 MB, but UploadRequest allows 5 MB.

Built:
- StationForm: ds TextField / TextAreaField, trimmed payload, Create
  disabled until there's a name, "{host}/station/{slug} · the link never
  changes" when editing (UpdateStationRequest ignores slug). Server
  validation errors land on the fields. The dialog mounts the form only
  while open, so a cancelled edit doesn't reappear.
- StationFormDialog is now edit-only (`station` required). Deleted
  CreateStationButton.
- Tests: artworkProblem; create posts + opens the station; edit shows the link.
- Review account for this page: `create@gocast.test` / `Password123!` (no
  station; don't press Create, or it stops being a create-page account).

### R5.8 — Account (built 2026-10-01, reviewed)

Decisions (Ammar):
- No billing exists, so no "Manage billing". Pro is the amber card listing
  what the plan includes, read off the plan's own flags (`planIncludes`), and
  "Ends 1 Nov 2026, then your account moves to Free." only for a
  time-limited (invite) plan. Free is a plain card with Request Pro.
- Password: Current + New with Show (new ds `PasswordField`); no confirm
  field — the API's `confirmed` rule is sent the same value. Google-only
  accounts get "Set a password" with the New field alone.

Built:
- One column (max-w-3xl), like the prototype: Plan, Profile, Password,
  Delete. Split into `components/dashboard/account/` — PlanCard,
  ProfileForm (Save off until something changed; current password appears
  only when the email changes; verify dialog rendered outside the form),
  PasswordForm, DeleteAccount (quiet row → the typed red confirm, unchanged).
- Page reads the user from the cookie after mount (`useMounted`), no effect.
- Tests: `planIncludes`, PasswordField show/hide.

### R5.7 — Station settings (built 2026-10-01, reviewed)

Decisions (Ammar):
- Show times keep our full editor (name, start time, add/remove, the
  station timezone — still its only home), in the prototype's look. Day
  chips are neutral off-white (`DayToggle tone="neutral"`), not red.
- Links follow the prototype: paste + Add (or Enter) saves at once, Remove
  saves at once; no name field or Save button. Names saved earlier are kept
  (the full list goes back as it was). Duplicates are refused.
- "New key" stays, inside the fold, under the five values.
- Free: the fold shows with a PRO tag; opened, one paragraph + Request Pro.

Built:
- Page: `PageHeader`, two columns from xl — Profile, Links, Show times |
  Where listeners find you, Use your own DJ software, Delete.
- `settings/ProfileCard` (Edit opens StationFormDialog), `LinksCard`,
  `StreamCard` (CopyFields; the direct stream is now the full address —
  a same-origin `NEXT_PUBLIC_ICECAST_URL` gets the app URL in front),
  `EncoderCard` as a card `Disclosure` with the four questions as row
  Disclosures + the help link; `EncoderConnection` restyled (rows, Show /
  Copy, setup steps in a Disclosure).
- `DayToggle`: `neutral` tone and `stretch` (seven equal columns).
  `Disclosure`: the chevron group moved to the trigger, so a nested question
  doesn't look open when its card is.
- Moved into `settings/`: DeleteStation (quiet card, "Delete station…"),
  TimezoneCombobox (restyled). Deleted: StationActions, LinksEditor,
  schedule/DayChip.
- Tests: ShowTimesEditor day mapping; nested Disclosure.
- Not visually checked: the Free-locked fold and the no-ingest message (the
  review account is Pro with ingest).

### R5.6 — Your shows (built 2026-10-01, reviewed)

Decisions (Ammar):
- Opening a show gives **Peak at** only. New `stream_sessions.peak_at`
  (migration 2026_10_01_120000), stamped by `SweepListenerSessions::recordPeak`
  in the same conditional UPDATE as `peak_listeners` (first time the peak was
  reached). Tracks played and audio lost are not recorded, so not shown.
- The "Last show" card is dropped; the list's top row is the last show.
- Summary = all-time counts + one honest trend sentence (`lib/showsTrend.ts`:
  latest ≤5 shows against the ≤5 before, ≥3 a side, ±15%, a peak change
  must be ≥1 listener). Nothing about who stays to the end; we don't measure it.
- "Show more" loads the next 20. `GET /stations/{slug}/sessions` gained
  `?finished=1` and a `summary` {shows, live_seconds} over every finished show.

Built:
- `components/dashboard/shows/ShowsList.tsx`: table card, STARTED (weekday
  date + mono time range on the station's clock) / FROM (md+) / ON AIR
  (off-white bar, capped at 3h) / PEAK; rows are buttons with aria-expanded;
  the opened row shows Peak at + From tiles.
- Page and loading rewritten on `PageHeader`; empty state = Go live button.
- Deleted `components/dashboard/RecentBroadcasts.tsx` (its last user).
- Tests: `lib/showsTrend.test.ts`; API `StreamSessionIndexTest` + two
  `peak_at` cases in `SweepListenerSessionsTest`.
- Deploy: run the migration.

### R5.5 — Audience (built 2026-10-01, reviewed)

Decision (Ammar): the prototype's live count as the page title ("3 people
are listening.") while anyone is tuned in and the station is on; "Audience"
otherwise.

- Header: `PageHeader` with the "How we count" help; the 7d / 30d / 90d range
  is `RangeLinks` (a link-based segmented control, so the range stays in
  the URL and the server renders it).
- Four `StatTile`s: 2×2 on a phone, one row from lg.
- "Listening time per day" chart: 200px, bar gap and radius scale with the
  range, today in violet, "TODAY" on the axis.
- Breakdowns in `Card`s, 2×2 from md: countries carry a mono country-code
  chip instead of emoji flags (flags don't render on Windows), bars are
  neutral on the control surface.
- Empty state: one `Card` with the tagged player link in a `CopyField`.
- "How we count listeners" is a card `Disclosure`; the upsell uses `ProTag` +
  the pro `Button`.
- Verified on the throwaway station with seeded listener rows (empty and
  populated, 1440 and 390 wide).

### R5.4 — Schedule (built 2026-10-01, reviewed)

Decision (Ammar): the prototype's two cards — RIGHT NOW (the plan,
labelled as what AutoDJ plays; "AutoDJ is off right now" when it is) and
YOUR NEXT SHOW — replace the live-status card. The status band and the top
bar's clock already say what the station is doing and the time.

- Header: `PageHeader`, the save lamp (green "All saved" / amber "Unsaved
  changes" / amber "Not saved: …"), timezone + Change, Add slot, Save. Save
  errors and the missing-timezone case are `Notice`s. Phone keeps the
  sticky save bar (now above the tab bar).
- `ScheduleNow` (new; `ScheduleStatus` deleted), reusing `describeProgramme`
  and `comingUp`.
- Week grid: 70px day column with the date under each day ("30 SEPT", on
  the station's calendar — `weekDates.ts`, shared with the phone strip),
  58px rows on the inset surface, 10px-cornered slots, show times as grey
  dashed "YOU" outlines (were red: red is live), off-white now line. The
  legend names each playlist used, with its swatch.
- Slot dialog: `TextField` name, playlist rows with swatches, 52px
  ±15-minute steppers, `DayToggle` for the days (mapped from the schedule's
  Sunday-first numbering), Done + quiet red "Delete slot".
- Phone day list: flat hairline rows instead of cards, dashed bar for show
  times, ghost "Add slot on …".
- Loading skeleton in the new geometry.
- `DayChip` is now only used by Station settings' show-time editor; it goes
  with that page.

### R5.3 — AutoDJ (built 2026-10-01, reviewed)

- `library/useLibrary.ts`: every list mutation and its optimistic update /
  refetch moved out of LibraryView unchanged (create / rename now take their
  arguments instead of reading dialog state). LibraryView is layout + which
  dialog is open; `PlaylistNameDialog` is its own file on `TextField`.
- Header: `PageHeader` (PRO tag + help when locked), mono stats line
  (tracks · length · storage), Jingles + Add tracks.
- `AutoDjStrip`: lamp + sentence (playing · time left · next, or off /
  silence / starting / live / not heard) + violet `Switch`; uses
  `stationHero` + `useStationPower`, confirms a stop that would cut
  listeners off, disabled while live or unknown. Free gets the upsell.
- Rail: LIBRARY / PLAYLISTS eyebrows, swatches shared with the schedule
  (`lib/playlistSwatches.ts`, moved out of WeekGrid), mono counts, quiet
  "+ New playlist".
- Table card: shared `LibraryToolbar` (inset search, ds `Select` sort, ⋯
  menu) and `LibraryFooter`; columns #, title + artist, In playlists chips
  (library; amber "Not in a playlist") or Added (playlist), length, Edit /
  Remove / Delete as words. Size column dropped (it's the length's
  tooltip). Selection bar, preview, inline edit, drag reorder, playing
  track in violet — all kept. Storage is a 3px `ProgressBar`.
- Jingles dialog: `SwitchRow`, presets 30 min / 1 hr / 3 tracks / 5 tracks
  + Custom (`jinglePresets.ts`, 2 tests) revealing Time/Tracks + the old
  values; list as `ListRow`s; dashed drop zone.
- Fix tags, track picker, add-to-playlist dialogs: ds inputs, swatches.
  Upsell, upload meter and loading skeleton rebuilt on the kit.
- Not verified headless: the switch (it starts a container), drag reorder.

### R5.3 — AutoDJ: decisions (2026-10-01)

- **AutoDJ switch strip** at the top of the page (prototype): what's playing,
  time left, next, and a violet switch; off asks first when anyone is
  listening (same as the overview); disabled while live; Free sees the
  upsell.
- **Keep all of ours** in the track table: multi-select + bulk actions,
  preview play, inline tag edit + Fix tags, sort + drag reorder.
- **Add** an "In playlists" chips column to All tracks, and mark the track
  AutoDJ is playing in violet.
- **Jingles**: switch + presets (30 min, 1 hr, every 3 / 5 tracks) + Custom
  (reveals today's number field), so no current setting is lost.

### R5.2 — Studio + Go live (built 2026-10-01, reviewed)

- **Go live** (`live/page.tsx`): pre-flight → one "Go live on {station}" →
  CheckList (`golive/CheckList`) → on air (the page calls `goLive()` itself
  when the checks reach `ready`) → studio. Failures and a blocked mic are
  amber `Notice`s with Try again / Back / "Go live with music only";
  someone else already on air is its own screen. Cancel during the checks
  stops them.
- Pre-flight parts: `ds/ChoiceCards` (mode, and Pick up / Start over),
  `golive/MicCheckCard` + `hooks/useMicPreview` (opens the mic on request,
  or at once if already allowed; picker when there's more than one; meter;
  released before the checks reopen it), `golive/RunningOrderCard` +
  `hooks/usePreflightQueue` (the IndexedDB queue the engine restores from:
  add via picker or drop, Remove, Clear; lengths read in the background;
  `lib/preflightQueue.ts` keeps the saved spot on the right song when a
  track is removed — 6 tests). Mic helpers moved to `lib/mic.ts`, shared
  with the checks; the engine's tag/duration readers are exported.
- **Studio** (`studio/page.tsx`): a normal page now (no fixed-height
  layout). Left: talk pad + mic check (`PushToTalk`), hint line, the big
  `MicLatchButton` (Keep mic open / red Close mic), Monitor + mic settings
  (`StudioControls`). Right: `NowPlaying`, `StudioStats` (On air,
  Listening + peak, Audio lost — green at 0), `FileQueue` (repeat, add,
  capped height with its own scroll), `YourLinkCard`, End show. The band
  is the only state display; `OnAirLamp`, `StreamPanel`, `OnAirDeck` and
  signal.ts's lamp styles are deleted, as is the shell's "fill page" mode.
- **Wrap** (`studio/wrap/page.tsx`): "That's a wrap." with On air, Peak,
  Tracks (new `AudioEngine.getTracksPlayed()`), Audio lost; Back to station
  / See all shows. End show and the studio's idle redirect go there; with
  no summary it forwards to the overview. `ShowSignOff` deleted.
- Verified headless: pre-flight add / remove / reload (persists), music
  only, going live end to end (it worked headless this time and started the
  throwaway station's container — stopped again afterwards via the
  overview), the studio live, the wrap screen, phone layout. Not verified:
  the mic check (no microphone headless), talking, mid-show controls.
- Left alone: `useBroadcastStats` still keeps a listener history that only
  the deleted StreamPanel drew.

### R5.2 — Studio + Go live: decisions (2026-10-01)

- **Pre-flight shows the running order itself**: the tracks (each with
  Remove), "+ Add files", drag-and-drop; Pick up / Start over for the saved
  spot stays. No "From your library" (would be a new feature).
- **One "Go live on {station}" button** → the checks run visibly (amber
  notice + Try again / Back if one fails) → live. **No 3-2-1 countdown**
  (Ammar: useless). The separate "Go live now" step goes.
- **Mic picker + level meter on pre-flight**, under Mic + music (the engine
  can't swap mics mid-show). Permission is asked when Mic + music is chosen.
- **Studio keeps** Monitor + volume, Mic settings, Repeat list / track, and
  the Link + QR rail — none are in the prototype.
- **"That's a wrap" screen in the studio** after End show (On air, Peak,
  Tracks played, Audio lost; Back to station / See all shows). Needs a
  tracks-played count. The overview's sign-off card goes.
- From the prototype by default: the global status band replaces the
  studio's own lamp card; End show is a button in the studio column.

### R5.1 — Overview (built 2026-10-01, reviewed)

- **Phone tab bar** (`shell/TabBar`): Station · Studio · AutoDJ · Schedule ·
  More (opens the drawer), below 640px; Studio shows a live dot while this
  tab broadcasts. `--tabbar-h` lets a fill page (the studio) end above it.
- **Hero** (`overview/OverviewHero`): the prototype's two panels on one
  surface — plain / violet / solid red / amber — with the lamp, the 34px
  line, what the buttons do, the AutoDJ now-playing well (title · artist,
  time left, bar, Next), and Listening now (count-up, mono 64). Its words
  and buttons come from `lib/stationHero.ts` (StationPower's rules — encoder
  vs another browser vs this tab, takeover and drain seconds, silent AutoDJ,
  degraded, checking / unknown — as a pure function, 15 tests).
  `hooks/useStationPower` holds start / stop / the encoder cut-off, shared
  with the status band. While this tab is live the hero offers only "Open
  the studio" (the old card also showed a stop the API refused).
- **Your link** (`overview/YourLinkCard`): CopyField (copies the tagged
  link), Tune-in code (`share/TuneInCodeDialog`, logic unchanged), Embed
  (PRO tag when locked), Share… (`share/ShareDialog`: Copy link, WhatsApp,
  Email, X, plus "More…" = the system share sheet where there is one).
- **Coming up** (`overview/ComingUpCard`, `lib/comingUp.ts`, 5 tests): each
  show time's next occurrence + AutoDJ's next slot, soonest first, in the
  station's zone ("Today 21:00", "Tomorrow 06:00", "Sat 10:00"). The API has
  no list of future slots, so AutoDJ contributes one row. Free accounts link
  to show times instead of Schedule.
- **Setup** (`overview/SetupChecklist`): remaining items as ActionRows, "N of
  6" SegmentBar, Hide for now in localStorage (`gocast:setup-hidden:<slug>`,
  verified across a reload). Track count from the playlists'
  `track_count` — the overview no longer fetches a playlist's tracks.
- **Your live shows** (`overview/LiveShowsCard`, `lib/liveShows.ts`, 5
  tests) and **Recent shows** (`overview/RecentShowsCard`: date · time,
  "From the studio / From Mixxx / From the desktop app", length, peak; "On
  air now" for a running show). Rendered after hydration (local dates).
- Header (`overview/OverviewHeader`), ShowSignOff and the loading skeleton
  rebuilt on the kit.
- Deleted: StationPower, GoLiveTrigger (Go live on Your shows now links to
  pre-flight), AutoDjRotation, StationActivity, StationChecklist,
  StationShare, LiveListeners, TrackProgress. `useCountUp` moved to hooks/.
- Not seen yet (the throwaway station has no container): the AutoDJ, live,
  silent and degraded hero states — covered by the unit tests, need eyes.

### R5.1 — Overview: decisions (2026-10-01)

- Hero while AutoDJ plays: **Go live now + Stop AutoDJ** (was "Turn station
  off"); the confirm still says listeners are cut off.
- **Go live goes straight to the studio pre-flight.** The browser-vs-DJ-
  software chooser (GoLiveTrigger) leaves the overview; encoder details live
  in Settings under "Use your own DJ software". The live "waiting for your
  encoder" watcher goes with the chooser.
- **Your link**: Copy in the link well, then Tune-in code, Embed, and
  **Share…** opening a dialog of targets (Copy link, WhatsApp, Email, X; the
  system share sheet too where the device has one).
- **Coming up** replaces the AutoDJ rotation card: the next things from show
  times and AutoDJ slots, "Schedule →".
- **Setup checklist**: only what's left, as tiles; "N of 6" bar; **Hide for
  now**, remembered per browser.
- **Your live shows**: the prototype's three numbers — On air (± vs the 14
  days before), Shows (average length), Peak (with its date) — and the
  chart. All-time total airtime dropped.
- **Header**: no stream-format fact, no Settings gear; clicking the artwork
  edits the profile; "Since <month year> · Last live <when>".

### R4 — the kit (built 2026-10-01, reviewed)

Gallery: `/dashboard/design-system` (404 in production builds) shows every
piece in every state inside the real shell.

`components/ds/`, one file each, built from the prototype's measurements:
- `Card` — tones card / raised / inset / outline / onair / live / warn /
  pro; sizes md (26px, 24px pad) / sm (18px, 16px); `interactive`;
  `CardHeader` (title, aside, description) and `CardLink` ("All shows →").
- `Field` — `TextField` / `TextAreaField` (label inside the filled box,
  error edge + message wired to aria-describedby, hint), bare `Input`.
  Fields sit on the control surface so they show inside a card.
- `Segmented` (Radix radio group: sm mono 30px / md 40px), `Switch` (live
  or onair) + `SwitchRow`, `DayToggle` (Mo–Su chips, live or onair, sm/md),
  `Select` (Radix, themed list).
- `Stat` (bare, mono label / 800 30 value / trend line green when up) and
  `StatTile`; `SegmentBar` ("4 of 6") and `ProgressBar` (onair / live / warn).
- `List` + `ListRow` (hairline-divided), `ActionRow` (raised tile with ›,
  Link when given href), `Disclosure` (row or whole-card, Radix Collapsible).
- `Tag` (neutral / pro / onair / ok / warn) + `ProTag`, `PageHeader`
  (42px title, aside, description, actions), `CopyField` (well + Copy,
  "Copied" / "Couldn't copy", announced).
- `Button` gains `danger-quiet` (the "Delete station…" entry point).
- Tests: 11 more (53 total). Radix arrow-key selection verified in the
  browser with a held key — Playwright's instant press releases the key
  before Radix's deferred focus, which looks like a bug and isn't.

### R3 — dialogs, confirms, menus, toasts (built 2026-10-01, reviewed)

Decisions (Ammar, 2026-10-01):
- **Confirms follow the prototype**: ending a show, removing tracks, turning
  AutoDJ off, clearing the queue → off-white primary. Only permanent deletes
  (station, account) are red — the error red `#FF8177` (`danger`), with the
  consequences listed and a typed confirmation. Replaces round 1's "every
  destructive confirm is live red".
- **Phones get bottom sheets** (the design system's Sheet: grabber, 30px top
  corners, actions stacked in thumb reach).

Built:
- `ds/Dialog` — prototype modal (#1B1916, 30px corners, 26px padding, 800
  title, × in the corner, 60% scrim); sizes sm 420 / md 500 / lg 600; bottom
  sheet below 640px. Footer buttons share the row, stack on phones.
- `ds/ConfirmDialog` + `useConfirm` — "Keep …" cancel (required), `tone`
  default | danger, `consequences`, `confirmText` (case-insensitive), `busy`
  lock. Tests.
- `ds/Menu` — DropdownMenu (items default / muted / danger, checkbox,
  label, separator) and Popover, as the account menu / Updates panel.
- `ds/Button` gains `danger`. Token `text-error` / `bg-error`.
- Toasts (dashboard scope, CSS): #2A2723 card, 600 14px, status dot instead
  of the icon (green done, red failed, amber warning). Position unchanged
  (the Toaster is shared with marketing).
- Every dashboard dialog / menu / popover moved to `ds/` (23 files).
  Rebuilt as ConfirmDialog: delete station (now type-the-slug), delete
  account, end show ("End your show?", "You've been on for 1h 12m"), turn
  station off, cut off an encoder, clear queue. Form dialogs follow the
  prototype: one full-width primary, no Cancel (×, Esc, scrim, swipe).
  `ui/use-confirm` deleted.
- Updates rows: leading dot (lit while unread) instead of the type icon,
  title / body / mono time, rounded rows, no dividers; detail dialog without
  the icon, its list in a card. `NotificationIcon` deleted.
- Shared `ProAccessDialog` (marketing + dashboard) still uses `ui/dialog`;
  its dashboard overrides now match (30px corners, 26px padding, title).
- Not in R3 (with their pages): the *inside* of dialogs — fields, selects,
  track rows, the encoder panel — and every page button outside a dialog.

### R2 — shell (built 2026-10-01, reviewed)

- **One status poll**: `StationStatusProvider` (contexts/StationStatusContext.tsx)
  in the dashboard layout. `useStationStatus` keeps its signature and reads
  the shared poll for the account's station, so the overview, library,
  schedule and end-show dialog no longer poll separately; the encoder
  dialog's fixed-cadence watch still runs its own. The old hook body is
  `useStationStatusPoll`.
- **`lib/airState.ts`**: the band's state as a pure function (this tab's
  broadcast outranks the poll; DJ software / another browser shown as live;
  AutoDJ silence and "running but not heard" amber). 13 tests.
- **`lib/dashboardNav.ts`**: the nav list, active-item and breadcrumb label in
  one place, shared by sidebar and top bar. Tests.
- **`components/ds/`** started: `Button` (primary / ghost / subtle / quiet /
  live / onair / onair-soft / pro / ink × sm 34 / md 40 / lg 52 / xl 64 /
  icon), `StatusLamp` (solid / soft / bare × tone), `StatusBand`. Tests.
- **Shell** (`components/dashboard/shell/`): `DashboardShell` (sticky top bar
  + band, body padded to the gutter and capped at 1240px; a page marks
  itself `data-page="fill"` to take the whole area — the studio does),
  `TopBar` (toggle, Station › Page, station-time clock, Updates),
  `StationBand`, `UpdatesMenu` (was NotificationBell; trigger, panel and
  header restyled — rows and the detail dialog are R3).
- **Sidebar** rebuilt: wordmark, station card with lamp, text nav with LIVE /
  ON dots and PRO tags, Free plan card, account menu ("Account and plan",
  Help, Sign out). Drawer below 1024px (was 768); closes on navigation.
- Deleted: `LiveBanner`, `BroadcastMiniController`, `DashboardHeader` and the
  toast offset rule for the mini controller.
- New tokens: `px-gutter` (18 / 36px), `max-w-page`, `shadow-panel`,
  `rounded-button-xl`, `text-fault-ink`. Trap found: a spacing token and a
  container token can't share a name — `max-w-page` resolved to the 36px
  spacing value until the spacing one was renamed `gutter`.
- Vitest config is `vitest.config.mts` with Vite's native tsconfig paths.
- Known until R5: the overview's own status card repeats what the band says;
  the studio shows the band *and* its own lamp; studio shortcuts / End are
  unchanged.
- Throwaway review account: `shell@gocast.test` / `Password123!` (Pro,
  station `night-shift-shell`, stopped). Delete with `e2e:auth delete` and
  the station row when the rollout ends.

### R2 shell — decisions (2026-10-01)

- **Status band** under the top bar on every station page (prototype). It
  replaces the red `LiveBanner` *and* the floating `BroadcastMiniController`:
  while live it carries a small transport (play/pause, skip, mic) on the
  right, plus "Open studio" off the studio page. Reconnecting is a band state.
- **Off-air band action:** Pro → "Start AutoDJ"; Free → "Go live" (Free has
  no AutoDJ; no upsell in the band).
- **Nav text-only**, no icons (prototype). Sidebar hides fully when collapsed;
  drawer on narrow screens. Station card (artwork + lamp text) at the top;
  nav dots Studio LIVE / AutoDJ ON.
- **Free accounts keep** the plan card (Request Pro) and amber PRO tags on
  AutoDJ / Schedule / Audience — the prototype only shows a Pro user.
- **Top-bar clock** in the station's timezone ("SAT 21:04 · LONDON"), hidden
  on phones.
- **"Updates"** text button with an unread count replaces the bell; the
  existing list, mark-all-read and detail dialog stay behind it.
- **Broadcasts → "Your shows"** in nav, breadcrumb and title; URL stays
  `/dashboard/broadcasts`.
- **Phone tab bar** (decided 2026-10-01, with R4): below 640px a fixed
  bottom bar as the prototype and the mobile app have (prototype tabs:
  Station · Studio · AutoDJ · Schedule · More), the drawer kept for
  the rest. Built at the start of R5.
- Kept without asking (behaviour, not look): Google avatar image with
  initials fallback, the sign-out-while-live confirm, slugless fallbacks for
  accounts with no station (no band, no station card there).

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
- [ ] **Show-time day chips are neutral** — off-white fill with dark ink
      (DayToggle `tone="neutral"`); red stays for live-right-now, violet for
      AutoDJ slots. Plus `stretch`: seven equal columns so a day never wraps
      alone on a phone.
- [ ] **Show times on the schedule week** — the owner's live shows drawn as
      grey dashed outlines labelled "YOU" (were red).
- [ ] **Country codes, not flags** — a mono two-letter chip (NG, US) before
      the country name in Audience breakdowns.
- [ ] **PasswordField** — TextField with a Show / Hide text button in the
      trailing slot; replaces "confirm password" fields.
- [ ] **ArtworkDrop** — dashed drop zone (inset well, 1.5px dashed line,
      56px tile, title + caption, Choose / Remove); "Square, up to 5 MB".
- [ ] **Your shows row detail** — a row opens to two inset StatTiles
      (PEAK AT, FROM); no Tracks played / Audio lost (not measured).
- [ ] **Plan card** — Pro = amber card with PRO tag and the plan's
      inclusions; no "Manage billing" (no billing yet); Free = plain card
      with Request Pro.
- [ ] **Dialogs on phones are bottom sheets**; cancel buttons always read
      "Keep …"; only permanent deletes use error red #FF8177 with a typed
      confirmation.
- [ ] **Nested Disclosure** — a question folded inside an open card keeps
      its own chevron state.

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
