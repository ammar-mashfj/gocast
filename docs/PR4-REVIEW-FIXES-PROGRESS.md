# PR #4 review fixes: progress (stopped 2026-10-11)

PR #4 "new design" (feat/dashboard-design → main) was reviewed, then "fix all, don't commit" was started. Work was stopped mid-way. **Nothing is committed.** Everything below is in the working tree.

## Status at a glance

| Area | State |
|---|---|
| Code fixes (API + client) | **Done.** tsc, lint, 132 vitest tests, and the slug-preview API tests all pass. |
| Marketing / help copy | **Done.** |
| Housekeeping (screenshots, dead files, customer email) | **Done.** |
| docs/features rewrite | **Partial.** 17 of 28 docs edited, 11 untouched, none re-stamped. |
| PR description | Draft written in `docs/PR4-DESCRIPTION-DRAFT.md`, not posted. |

## Done

### Uncommitted changes that predate the review
These were reviewed and judged correct. They are still uncommitted alongside the fixes: sessions summary only on page 1, `Station::RESERVED_SLUGS`, create-page preview falls back on error, Back from the go-live error state releases the station, the stop/start race guard in BroadcastContext, carry reset on a new socket in broadcast.ts, probe timeout adds overhead (+ `client/lib/uplinkProbe.test.ts`).

### Review fixes
- **Encoder go-live path restored.** `settings/EncoderCard.tsx` has a `ConnectionWatcher`: a 2s poll while the card is open; it shows off air with a **Put it on air** button, starting, waiting, taken by another source, or connected. It refreshes the shared poll and server render once on connect. The card has `id="encoder"` (new optional `id` prop on `components/ds/Disclosure.tsx`). The go-live pre-flight footer links "Using DJ software instead?" to `settings#encoder` when the station has encoder details.
- **Links can be named again.** `settings/LinksCard.tsx` has an optional name field, max 30 like the API. The placeholder is the suggested name. A name equal to the suggestion saves as null.
- **Status band shows the current track title** off the studio page (`shell/StationBand.tsx`).
- **Pre-flight queue** (`hooks/usePreflightQueue.ts`): drops files saveQueue couldn't store and warns. A latest-state ref stops add() from overwriting a Remove/Clear or filled-in durations.
- **Mic preview** (`hooks/useMicPreview.ts`): clears the dead stream on failure. It retries without the saved device only when one was saved.
- **Wrap page** removes the sign-off summary after reading it.
- **"Tomorrow" across DST** (`lib/comingUp.ts`), with a London spring-forward/fall-back test.
- **Your shows** page rethrows non-404 errors so the error page offers Try again.
- **Shows links use the station timezone** (`lib/liveShows.ts` takes `timeZone`, + tests).
- **Clear running order** confirm passes `busy`.
- **Notification icons restored** (`components/dashboard/NotificationIcon.tsx`, new).
- **Slug preview validates `name`** (string, max 100): `?name[]=` is a 422, not a 500. Test added.
- **Dead overview components deleted:** SetupChecklist, LiveShowsCard, RecentShowsCard (`git rm`, staged).
- **11 MB `screenshots/dashboard/` removed** (`git rm`, staged).
- **Customer email redacted** from `docs/STATION-LOG-PLAN.md`.
- **Copy:** custom-domain claim → embeddable player (ProgrammeSection); slot start wording covers hard starts; "Private until shared" → "Listeners need no app" (TrustCues); "One station." removed from the Free card; help status table uses the screen's labels (Silence, Not heard, Checking, No answer, Going live, Show ended); whitespace trap in create-your-station; StudioDeck demo repeat is all/one only.
- `/dashboard/design-system` already 404s in production; no change needed.

## Not done: pick up here

1. **Finish the docs/features rewrite.** These 11 were not touched:
   configuration-reference, deployment-infra, dev-environment-and-testing, liquidsoap-station-script, liquidsoap-supervisor, listener-analytics, mobile-app-shell-and-auth, mobile-studio-and-encoder, observability-and-events, public-player-and-embed, web-shared-frontend.
   The 17 edited ones were done by agents that were stopped, so skim each diff (`git diff docs/features/`) before trusting it. Re-read EncoderCard, LinksCard and StationBand when checking station-management-dashboard.md and encoder-ingest.md, since those changed late.
   Method per doc: read it, read its `sources:` files, fix wrong claims and dead paths.
2. **Re-stamp every doc** once the prose is true: `bash scripts/docs-check.sh --stamp docs/features/NAME.md` for each, then `bash scripts/docs-check.sh` should be all OK (it is 28 STALE, 0 BROKEN now).
3. **Optional:** the PR's Pro card still says "Embed your player, on your own domain" (`PricingSection.tsx` ~line 33); align with the ProgrammeSection wording.
4. **Run the API files once more**: `php artisan test --compact tests/Feature/StationSlugPreviewTest.php tests/Feature/StreamSessionIndexTest.php`.
5. **Look at the encoder card in your browser** (settings → Use your own DJ software) with the station off, then on, then with BUTT connected. Not browser-tested.
6. Post `docs/PR4-DESCRIPTION-DRAFT.md` as the PR body (PR #4's body is empty), then delete both of these files. Commit when you say so.

## Review findings left as-is on purpose
- Auth pages dropped confirm-password fields and added a required Terms checkbox that also gates Google sign-in. This is a design choice, not a bug.
- Free users can still "Add from library" into a playlist (same as main).
- Previous button enabled on a one-track queue; unticking the last day in a slot does nothing (same as main).
