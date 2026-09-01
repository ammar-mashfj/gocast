# Station page — backend gaps

What the redesigned station dashboard (`/dashboard/stations/[slug]`) cannot show
because the API does not record it. Written 2026-08-30 while applying the
`suggestions/1` design; every blocker below was verified against the code on
branch `feat/liquidsoap-harbor-ingest`, not inferred from the schema.

The client side is done and shipped — everything here is `api/` work. The page
currently omits or relabels each of these rather than rendering a number that
is quietly wrong.

## The table

| # | Gap | Blocker (verified) | Backend change | Size |
|---|---|---|---|---|
| 1 | **Encoder settings card** (BUTT / Mixxx / OBS) | Only credential is a 60s HMAC token — `BroadcastTokenService::TTL_SECONDS = 60`, minted per connection. No `stream_key` column exists anywhere. Transport is **already fine**: `api/resources/views/liquidsoap/station.blade.php:196` says harbor speaks the Icecast source protocol. | Rotatable per-station `stream_key`; accept it in `HarborAuthController` alongside tokens; expose host/port/mount/key on `StationResource` owner-only (same pattern as `watermarked`); make port 8090 internet-reachable — `LiquidsoapSupervisor::ingestUrl()` returns a container bridge IP | **L** |
| 2 | **AutoDJ airtime in analytics** | `stream_sessions` rows are written only for human broadcasters (`StreamSessionController::store`, `StationEventController` `live_connected`). Putting a station on air with AutoDJ records nothing. | Open/close a period on `station_started` / `station_stopped` — either a session with `source_type: autodj` or a separate `airtime_periods` table | **M** |
| 3 | **Listening hours, per-broadcast avg** | `stream_sessions.total_listener_minutes` is in the migration and the model cast, and **nothing writes it** (grep-confirmed) | One increment in `SyncListenerCounts::recordPeak` — it already runs every minute holding the count | **S** |
| 4 | **Reliable 14-day windows** | `StreamSessionController::index` is `paginate(20)` with no date filter | Accept `?since=`, or add `/stations/{slug}/stats?days=14` returning daily buckets server-side | **S–M** |
| 5 | **`Source` column can't say "AutoDJ"** | Enum is `['browser','electron','external']` in both the migration and the validation rule | Extend the enum — only meaningful once #2 lands | **S** |
| 6 | **Public / unlisted toggle** | No visibility column; every station appears in `/discover` | `stations.visibility`, honoured in `PublicStationController::index/featured` + sitemap | **M** |
| 7 | **Data transferred per broadcast** | Not tracked at all | Per-mount byte accounting from Icecast in `SyncListenerCounts` | **M** |
| 8 | **Owner listener count** | Works, but the dashboard polls the **public** endpoint because `StationStatusController` has no listener field | Add `listeners` to the status payload — collapses two polls into one authenticated call | **S** |
| 9 | **Embed player** | — | Client route, plus a `frame-ancestors` / `X-Frame-Options` allowance for the embed path | **S** |
| 10 | **Per-station bitrate** | `%mp3(bitrate=128, samplerate=44100)` hardcoded at `station.blade.php:1122`; the UI prints it as a constant in two places | Only if you want per-plan quality: column + template variable + resource field | **M** |

## Why these are easy to miss

Three of them look done from the schema alone:

- `total_listener_minutes` **exists as a column and is cast on the model.** It is
  a permanent zero. Any "listening hours" metric built on it is a broken-looking
  page, not an honest empty state.
- `stream_sessions` **looks like an airtime log.** It is a *live broadcast* log.
  An always-on AutoDJ station has hours of airtime and zero sessions, so it
  reads as dead. Anything derived from these rows must say "live broadcasts
  only" — the redesigned activity card does.
- **Harbor already accepts the Icecast source protocol**, so #1 looks like a
  five-minute job. It is not the transport that is missing, it is a credential a
  desktop encoder can hold for longer than a minute.

## Client-side decisions taken in the meantime

So that whoever picks this up knows what to undo:

- **Suppressed, not faked.** The 14-day period comparison hides itself when
  `total > returned` rather than doing arithmetic on a truncated page.
- **Dropped from the design entirely:** listening-hours tile, per-broadcast
  `Avg` column, `Public` badge, `Pause AutoDJ` button (we have start / stop /
  skip; "pause" would mean killing the container and disconnecting listeners).
- **Shipped without backend help:** the tune-in QR code, and
  `/dashboard/stations/[slug]/settings`, which gave the danger zone a home and
  surfaces `watermarked` — previously in the API and rendered nowhere.
