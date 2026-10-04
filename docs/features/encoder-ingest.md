---
feature: Encoder ingest (BUTT, Mixxx, any Icecast source client)
verified: 2026-10-04 against e145a37 plus uncommitted work
sources:
  - infra/native/station-router/ingest.js
  - infra/native/station-router/nginx.conf
  - infra/native/station-router/Dockerfile
  - infra/native/verify-ingest.sh
  - infra/native/setup-native.sh
  - infra/native/deploy-native.sh
  - infra/native/docker-compose.native.yml
  - infra/native/env/domains.env.example
  - infra/native/env/api.env.example
  - api/app/Http/Controllers/StreamKeyController.php
  - api/app/Http/Controllers/HarborAuthController.php
  - api/app/Http/Controllers/StationEventController.php
  - api/app/Http/Controllers/StationStatusController.php
  - api/app/Http/Controllers/StationController.php
  - api/app/Http/Controllers/StationPowerController.php
  - api/app/Http/Controllers/StreamSessionController.php
  - api/app/Http/Controllers/BroadcastTokenController.php
  - api/app/Http/Controllers/MetricsController.php
  - api/app/Http/Middleware/VerifyInternalKey.php
  - api/app/Services/IngestMetrics.php
  - api/app/Services/BroadcastTokenService.php
  - api/app/Services/StationLifecycleService.php
  - api/app/Services/StationLifecycleException.php
  - api/app/Services/StationAudioPolicy.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Models/Station.php
  - api/app/Models/StationEvent.php
  - api/app/Models/User.php
  - api/app/Models/Plan.php
  - api/database/migrations/2026_09_15_140000_add_encoder_enabled_to_plans_table.php
  - api/database/migrations/2026_09_15_140100_add_stream_key_to_stations_table.php
  - api/config/liquidsoap.php
  - api/routes/api.php
  - api/resources/views/liquidsoap/station.blade.php
  - client/components/dashboard/EncoderConnection.tsx
  - client/lib/clipboard.ts
  - client/app/dashboard/stations/[slug]/settings/EncoderCard.tsx
  - client/app/dashboard/stations/[slug]/settings/EncoderSection.tsx
  - client/contexts/AccountContext.tsx
  - client/interfaces/Station.ts
  - mobile/src/app/station/[slug]/index.tsx
  - mobile/src/components/station/overview.tsx
  - mobile/src/components/station/usePower.ts
  - client/lib/stationHero.ts
  - client/components/dashboard/overview/OverviewHero.tsx
  - client/components/ds/Disclosure.tsx
fingerprint: 25ee764e2b51e0f1
---

# Encoder ingest

A Pro owner can broadcast from desktop software (BUTT, Mixxx, RadioDJ, Audio Hijack, ffmpeg, anything that speaks the Icecast 2 source protocol) instead of the browser studio. The encoder connects to a public TCP port on the **station router**, which reads the first line of the connection to learn the station, then splices the socket to that station's Liquidsoap container. Liquidsoap's `input.harbor` authenticates the connection by calling Laravel, and the broadcast takes over from AutoDJ exactly as a studio broadcast does.

The one thing people get wrong: **the router authenticates nobody and does not start anything.** It only picks a destination. The credential is checked by harbor inside the container (via `HarborAuthController`), and the container has to already be running. An encoder pointed at a switched-off station fails at DNS in the router and the connection is closed, which BUTT and Mixxx show as a socket error, indistinguishable from a wrong key. The second trap: rotating the stream key does **not** disconnect a broadcast that is already on air.

The browser studio uses the same harbor input with a different credential and a different front door. See [Broadcasting web studio](broadcasting-web-studio.md) for that side and [Liquidsoap station script](liquidsoap-station-script.md) for the rest of the `.liq`.

## What it actually does

End to end, for one BUTT session on station `my-station`:

1. **DJ config** (composed by the API, see "The connection details"): server `LIQUIDSOAP_ENCODER_HOST`, port `LIQUIDSOAP_ENCODER_PORT` (default 8010), mount `/my-station`, username `source`, password = the station's stream key.
2. **Host port to router.** `docker-compose.native.yml` publishes `${INGEST_PORT:-8010}:8000` on **all interfaces** for the `gocast-station-router` container. The container side is always 8000. Docker publishes this in front of ufw.
3. **Router `stream` block** (`station-router/nginx.conf`, `server { listen 8000; ... }`): `js_preread ingest.route` runs `ingest.js`, which accumulates the first bytes of the connection and picks `$station_upstream`. Then `proxy_pass $station_upstream`. All bytes it read are forwarded to the upstream untouched.
4. **Container.** `gocast-liquidsoap-{slug}:8090` on `gocast-network` (`LiquidsoapSupervisor::CONTAINER_PREFIX` = `gocast-liquidsoap-`; `harbor_input_port` default 8090). Docker DNS resolves it at connect time (`resolver 127.0.0.11 valid=10s ipv6=off`).
5. **Harbor auth.** `input.harbor("{slug}", port=8090, auth=harbor_auth, ...)` calls `harbor_auth`, which POSTs `{slug, user, password, address}` to `{apiUrl}/api/internal/harbor-auth` with header `X-Internal-Key` (5 second timeout). `slug` is baked into the container's `.liq`, not taken from the request, so a key for station A can never open station B's container. Anything but HTTP 200, a timeout, or an unreachable API, is a refusal (fails closed).
6. **Laravel decides** (`HarborAuthController`, see "Authentication").
7. **On accept**, harbor fires `on_connect(synchronous=false)`, which sets `live_connected := true` and POSTs a `live_connected` event with `client` (User-Agent, clipped to 255) and `via` (`external` for anything without a WebSocket upgrade) to `/api/internal/station-event`. Laravel opens the `StreamSession` with `source_type = 'external'`. AutoDJ steps aside (`fallback(track_sensitive=false, [live, autodj_mix, bed])`). See [Station lifecycle](station-lifecycle.md).
8. **Titles.** libshout sends track titles on a separate connection; the router rewrites them (see "The six connections").
9. **On disconnect**, `on_disconnect` sets `live_connected := false` and posts `live_disconnected`; Laravel closes open sessions and deletes `metadata:{station_id}` in Redis.

Things it does **not** do: it does not start a station, wake a container, or check the plan at the router. A connection attempt to a stopped station just fails.

## The router (`infra/native/station-router`)

### Why TCP and not an nginx `location`

Every libshout client opens audio with `SOURCE /mount HTTP/1.0`, with no `Content-Length` and no `Transfer-Encoding`. nginx's http module cannot frame that body, so proxying it produces a connection that "succeeds" and carries silence. So ingest is routed in the `stream` block with njs (`ingest.js`), and the http block is used only for the studio WebSocket (`/broadcast/{slug}` on 8091), the OPTIONS responder and the metadata rewriter.

### Ports and servers in the one nginx

| Listener | Where | Purpose |
|---|---|---|
| `8091` (http) | Host loopback `127.0.0.1:8091` | `/broadcast/{slug}` WebSocket proxy for the studio (path rewritten to `/{slug}`, `proxy_read_timeout`/`send_timeout` 24h), `/healthz`, everything else 404. Not ingest. |
| `127.0.0.1:8092` (http) | In-container only | Answers libshout's `OPTIONS` probe with 200 and `Allow: GET, POST, HEAD, OPTIONS` (deliberately no PUT). `error_page 400 =200 /probe` handles the `OPTIONS *` asterisk-form target nginx rejects as 400. |
| `127.0.0.1:8093` (http) | In-container only | Metadata rewriter: `location = /admin/metadata { js_content ingest.metadata; }`, `client_max_body_size 4k`, plus `@harbor_metadata`. |
| `8000` (stream) | Published as host `INGEST_PORT` (default 8010), all interfaces | The encoder front door. |

Stream server settings: `limit_conn ingest_per_ip 10` (10 concurrent connections per source IP, zone 1m), `preread_buffer_size 4k`, `preread_timeout 5s`, `proxy_timeout 24h`. Access log format `ingest` logs `$remote_addr -> $station_upstream status bytes_in bytes_out duration` to stdout: it is the only place the real encoder IP survives.

### How `ingest.js` routes (`resolve()`)

It accumulates chunks per connection (buffer is local to `route()` so connections cannot interleave), waits for the first `\n`, then tests the first line in this order:

| First line matches | Upstream | Notes |
|---|---|---|
| `^[A-Z]+ /(SLUG)/? (HTTP/1.0\|HTTP/1.1\|ICE/1.0)` | `gocast-liquidsoap-{slug}:8090` | Any uppercase verb (SOURCE, PUT, POST, ICY spellings). `SLUG = [a-z0-9][a-z0-9-]{0,62}`, anchored, because the capture becomes a hostname the container dials. |
| `^OPTIONS \S+ HTTP/1.[01]` | `127.0.0.1:8092` | The libshout PUT probe. No mount, so it cannot be routed to a station. |
| `^(GET\|POST) /admin/metadata(\?\|\s)` (case-insensitive) | `127.0.0.1:8093` | Handed off whole; the http hop does the parsing. |
| anything else | refused | `s.deny()`: connection closed with no reply (`s.send()` is not allowed in a preread handler). Logged as `ingest refused (...)`. |

A complete first line that matches none of the patterns is refused at once. Refusal also happens if more than 4096 bytes (`MAX_PREREAD`) arrive with no newline, or the client half-closes (`flags.last`) before a routable line arrives. `preread_timeout` covers a silent client.

Consequence worth knowing: because any uppercase verb with `/{slug}` is forwarded, a browser `GET /my-station HTTP/1.1` on the ingest port is forwarded to that station's harbor too; harbor answers for itself.

### The six connections of one libshout broadcast

Captured from libshout 2.4.1 on 2026-09-15 (the comment header of `ingest.js`); this is the reason for each design choice.

| # | Request | What handles it |
|---|---|---|
| 1 | `OPTIONS * HTTP/1.1` (PUT probe) | Router's 8092 responder. A reset here is fatal to the whole connect (`shout_open() failed: err=Socket error`), so it must be answered. |
| 2 | `SOURCE /slug HTTP/1.0`, no credentials | Harbor answers 401 + `WWW-Authenticate` itself. The script's comments and `verify-ingest.sh` check 2 say harbor answers this itself without calling the auth callback, so it would not reach `HarborAuthController` or move `gocast_harbor_auth_total`; that is Liquidsoap runtime behaviour and cannot be confirmed from the repo. That signal is what makes libshout retry with credentials. |
| 3 | `SOURCE /slug` with `Authorization: Basic` | The audio, for the whole show. Harbor calls `harbor_auth`. |
| 4 | `OPTIONS * HTTP/1.1` again | 8092 responder. |
| 5 | `POST /admin/metadata`, mount in the **form body**, no auth | 8093 rewriter, then harbor answers 401. |
| 6 | `POST /admin/metadata` + Basic auth | 8093 rewriter, then harbor. This carries the title on each track change. |

### The metadata rewrite (`ingest.metadata`)

Harbor reads `mode`, `mount`, `song` only from query args; libshout puts them in a form body, so a stock harbor answers `400 unrecognised command` and titles never update. `metadata(r)`:

1. `payload = r.requestText || r.variables.args`.
2. Finds the mount with `META_MOUNT` (`[?&\r\n]mount=(?:%2[fF]|/)(SLUG)(?:[&\s"]|$)`, no `i` flag, so the slug capture stays lowercase). No match: `400 no mount`.
3. Sets `$meta_upstream = gocast-liquidsoap-{slug}:8090` and `$meta_args = safeArgs(payload)`, then `internalRedirect('@harbor_metadata')`.
4. `safeArgs` percent-encodes only characters that break a request line (`\x00-\x20`, `\x7f`, `#`). `%` and non-ASCII are left as sent (a blocklist, on purpose, to avoid double-encoding and UTF-16/UTF-8 mistakes).
5. `@harbor_metadata` does `proxy_method GET`, drops the body, clears `Content-Length`/`Content-Type`, **forwards `Authorization` explicitly**, and proxies to `http://$meta_upstream/admin/metadata?$meta_args`. The client sees harbor's answer including its 401.

### Build and deploy

- `Dockerfile`: `FROM nginx:1.29.8-alpine`, then `apk add nginx-module-njs=1.29.8.0.9.6-r1` from nginx.org's Alpine v3.23 repo. The nginx version and the module version are one pinned decision: dynamic modules refuse to load on any other nginx build, and the container then will not start, taking `/broadcast/{slug}` (the studio) down with it. Bump both or neither. Compose tags the image `gocast/station-router:1.29.8`.
- `nginx.conf` and `ingest.js` are bind-mounted read-only, not copied, so a routing change needs the router container restarted, which drops encoders mid-broadcast **and** the studio WebSocket proxy (same container, port 8091). `deploy-native.sh` does not do it: when anything under `infra/native/station-router` changed it prints a manual step telling you to run `sudo bash infra/native/setup-native.sh`, which runs `docker compose up -d --build` (rebuilds the image, so a module bump is picked up).
- `nginx.conf` loads both `ngx_stream_js_module.so` and `ngx_http_js_module.so`; the two njs VMs are separate, which is why `ingest.js` exports two unrelated entry points (`route`, `metadata`).
- `worker_processes 1`, `worker_connections 1024`, container memory limit 128M.
- `verify-ingest.sh` is the post-deploy check (see Tests).

## Authentication (`HarborAuthController`)

`POST /api/internal/harbor-auth`, route in `api/routes/api.php` inside `['internal', 'throttle:internal']` (`VerifyInternalKey` compares `X-Internal-Key` to `services.internal_api_key` with `hash_equals`, 401 on mismatch, throws if the key is unset; `throttle:internal` is 300/min per IP). Validation: `slug` required string max 255; `password` nullable max 2048; `user` and `address` nullable max 255. `user` is never checked: the username `source` is convention only.

Decision order:

1. Empty password: refuse, method `none`.
2. One lookup, `Station::with('user.plan')->where('slug', $slug)->first()` (soft-deleted stations excluded by `SoftDeletes`). A thrown DB error: refuse `none` ("auth backend unavailable"). No station: refuse `none`.
3. `BroadcastTokenService::verify($secret, $slug)` non-null: **allow** (`allowed{method="token"}`). This is the studio path: a 60 second HMAC-SHA256 token signed with `APP_KEY`, station-bound, no DB read. **No plan check here.** Every plan has the studio.
4. `streamKeyMatches()`: reads the `encrypted` `stream_key` (a decrypt failure is caught and treated as a non-match, logged as a warning), empty key never matches, comparison is `hash_equals`. On a match: if `!$station->user?->canUseEncoder()` refuse with method `plan` ("encoder broadcasting is not available on this plan"); else **allow** (`allowed{method="key"}`).
5. Otherwise refuse `unknown` ("invalid or expired credential").

Refusals return HTTP 403 with the reason as the body, log `Harbor auth refused a publisher` at info with `station`, `user`, `address`, `method`, `reason`. **The credential is never logged**, and Sentry does not get the request body because `send_default_pii` is off.

`canUseEncoder()` (`User`) is `plan?->encoder_enabled ?? false`. The migration `2026_09_15_140000` adds `plans.encoder_enabled` (default false), sets it true for `pro` and for every plan that is not `free` or `pro`, false for `free`. There is no per-user override.

Plan gating is therefore enforced at **connect time only**. A downgrade does not kick an on-air encoder; it is refused the next time it connects. Harbor authenticates the audio connection once.

### Metrics (`IngestMetrics`, `MetricsController`)

Redis `INCR` on `metrics:harbor-auth:{outcome}:{method}`, never throws (a dead Redis costs a graph gap). Exposed by `MetricsController` as `gocast_harbor_auth_total{outcome,method}` with a zero for every combination:

| outcome | method | Meaning |
|---|---|---|
| allowed | `token` | Studio |
| allowed | `key` | Encoder with a valid key on an allowed plan |
| refused | `plan` | Valid stream key, owner's plan has no encoder. A billing signal, not a typo. |
| refused | `unknown` | Wrong key, expired token, probes. Includes a stream key that does not match. |
| refused | `none` | No credential, unknown station, or DB down. Mostly scanners. |

Other values passed to `bump()` are silently ignored (label cardinality guard). There is no `refused{method="key"}`. Counters are cumulative and reset if Redis is flushed.

## Stream keys

| Aspect | Reality (`Station.php`, migration `2026_09_15_140100`) |
|---|---|
| Column | `stations.stream_key` (text, nullable), `stations.stream_key_rotated_at` (timestamp, nullable) |
| Storage | `encrypted` cast (APP_KEY), not hashed, so the settings card can redisplay it |
| Generation | `Station::generateStreamKey()` = `Str::password(32, letters, numbers, no symbols, no spaces)`: 32 chars of `[A-Za-z0-9]`, from `random_int` |
| When minted | In `Station::booted()` `creating` (`??=`), for **every** station on every plan, and backfilled by the migration for all existing stations including soft-deleted (via the model so the cast applies, `timestamps = false` so `updated_at` is not touched). Free stations hold a key they cannot use. |
| Rotation | `POST /api/stations/{slug}/stream-key` (`StreamKeyController::rotate`). `rotateStreamKey()` uses `forceFill` and stamps `stream_key_rotated_at`. No request body; the client cannot choose the value. |
| Who can choose | Nobody. `stream_key` is absent from the update request, and `Station` is `$guarded = []` so the protection is the request class, not the model. |
| Rotation guards | `auth:sanctum`, `verified`, `throttle:6,60,stream-key` (six per **sixty minutes**, on its own named counter so other throttled routes don't eat into it), `authorize('update')` (owner only), then `canUseEncoder()` else 403 `code: encoder_not_available`. |
| Audit | `StationEvent::TYPE_STREAM_KEY_ROTATED` (`stream_key_rotated`, source owner), without the key. Admin monitoring only. |
| Lifetime | Long-lived. There is no expiry, no per-encoder key and no revocation list. Only replace-all. |
| APP_KEY rotation | Every stored key becomes undecryptable. Harbor auth treats that as "no match" (refusal, not a 500), the API returns `password: null`, and the owner recovers by rotating. |

**Rotation does not disconnect anyone.** The controller docblock, `Station::rotateStreamKey()`, the card copy and the confirm dialog all say so. The panic sequence is: Turn station off (which refuses with `station_is_live_external`, then offers a force cut-off), then rotate.

## The connection details (`StationResource`)

`toArray()` adds an `encoder` block only when **all four** hold:

1. `$this->withEncoder` was called. Only `StationController::show` and `StreamKeyController::rotate` call `withEncoder()`. The list/index, public, embed, power-toggle and schedule responses never include it, and `collection()` never opts in.
2. `$request->user()?->id === $this->user_id` (owner only).
3. `$request->user()->canUseEncoder()`.
4. `config('liquidsoap.encoder_host')` is filled.

Block shape: `host` (`LIQUIDSOAP_ENCODER_HOST`), `port` (`LIQUIDSOAP_ENCODER_PORT`, default 8010), `mount` = `/{slug}`, `username` = `source`, `password` (`readableStreamKey()`, which catches a decrypt failure and returns null), `rotated_at`. The plan is read off the authenticated user, not each row's owner, to avoid N+1.

An empty `encoder_host` means "not deployed here": the block is omitted and the UI says the feature is unavailable. `api.env.example` leaves `LIQUIDSOAP_ENCODER_HOST` empty on purpose (a hostname copied from another deployment would point DJs at that deployment's router) and requires `LIQUIDSOAP_ENCODER_PORT` to equal `INGEST_PORT` in `domains.env`; `setup-native.sh` exits with an error while `INGEST_PORT` equals any of `ICECAST_PORT`, `ROUTER_PORT`, `CLIENT_PORT` or `INTERNAL_API_PORT` (the router container publishes both `ROUTER_PORT` and `INGEST_PORT`, so a clash there would also take the studio down), and it deliberately does not add a `ufw allow` for the ingest port.

Because `StationController::show` is also the fetch behind the station overview and the go-live page, the plaintext key reaches those owner-only screens too, not just Settings.

## Liquidsoap harbor side (`station.blade.php`)

`live_in = input.harbor(slug, port={{harborInputPort}}, auth=harbor_auth, buffer=5., max=10., timeout={{harborInputTimeout}}, icy=true, icy_metadata_charset=..., metadata_charset=...)`:

| Setting | Value | Source |
|---|---|---|
| Port | 8090 | `LIQUIDSOAP_HARBOR_INPUT_PORT` |
| Mount | `/{slug}` (input.harbor registers the bare slug) | `$station->slug` |
| Stalled-source timeout | 10.0 s | `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT`. A dead connection holds the mount (and refuses reconnects) until this elapses; it is also the only thing that ends a stalled show. |
| `buffer` / `max` | 5 s / 10 s (literals in the template) | cut from Liquidsoap's default 12 s to reduce live latency |
| ICY/in-band metadata | `icy=true` accepted | title from the encoder's own metadata |
| Charset | `LIQUIDSOAP_METADATA_CHARSET`, default `UTF-8` | set for both the Icecast and webcast paths |
| Missing titles | `metadata.map(insert_missing=true, ...)` substitutes `LIQUIDSOAP_LIVE_BROADCAST_TEXT` (default `Live Broadcast`) when the broadcaster sends none | |

After harbor: `buffer(buffer=2., max=10.)`, then straight into `fallback(track_sensitive=false, [live, autodj_mix, bed])`. There is **no dead-air guard** (blank.strip removed): a connected encoder holds the fallback even if it sends silence, and only harbor's `timeout` ends a stalled source. Harbor takes **one source per mount**: while an encoder is attached the studio cannot take over, and vice versa.

`live_via(headers)` decides `browser` vs `external`: a WebSocket `Upgrade` header or a `Sec-WebSocket-Protocol` marks browser; everything else, including a client with no headers, is `external`. Header lookup is case-insensitive (`live_header`) because harbor 2.4.5 delivers the headers as the client spelled them. The `Authorization` header holds the stream key, so only `user-agent` is read (three labels are read by name; the list is never forwarded).

`/status` on the container reports `broadcaster = live_connected()` (true the moment harbor accepts; not delayed by the live buffer), separate from `source` (which arm is feeding the encoder).

## Session and attribution

`StationEventController` (`POST /api/internal/station-event`, internal key): validates `slug` (max 64; unknown station is 404) and `event` (max 32) against `StationEvent::CONTAINER_TYPES`, `client` nullable max 255 (trimmed, empty becomes null), `via` nullable in `browser|external`. On `live_connected` it calls `openSession()`: idempotent (an open session is left alone), creates the `StreamSession` with `source_type = via ?? 'browser'` (default `browser` for containers not yet relaunched) and `client`, and dispatches `SendStationLiveNotifications` with a 2 minute delay. On `live_disconnected` it closes all open sessions and clears `metadata:{id}`. `live_connected`/`live_disconnected` are broadcast to the dashboard (`StationStateChanged`, queued, not inline, so the php-fpm pool is never blocked). It also writes a `StationEvent` timeline row carrying `via` and `client`, and caches the last event under `station-event:{id}` for an hour. Session rows are the only evidence an encoder was ever connected: an encoder makes no API call of its own.

`StationStatusController` returns `broadcaster` (from the container) and `live_source: {type, client}` read from the open session. Related rules elsewhere in the stack:

- `StreamSessionController::store` refuses (409 `station_already_live`) when an external session is open ("This station is already live from Mixxx 2.5.0. Disconnect it there before broadcasting from the studio."). `source_type: 'external'` cannot be POSTed by a client (`Rule::in(['browser','electron'])`). A session row for a stopped station is treated as a ghost and cleared.
- `StationLifecycleService::stop()` on a live station refuses with `StationLifecycleException::liveBroadcast()`: HTTP 409, code `station_is_live_external` (message names the client) or `station_is_live`. `POST /stations/{slug}/stop` with `force: true` is honoured **only** if the open session is external, re-read under the lock (`cutExternal`), audit reason `owner_cutoff`; a browser broadcast still gets the refusal. The session is closed before the container is torn down.
- `StationAudioPolicy::studioHasGoneForGood()` only counts `source_type === 'browser'`, so the studio-closed auto-stop clock (`studio_gone_stop_seconds`, 150 s) never applies to an encoder broadcast.

## Surfaces

**Web dashboard, Station settings: `EncoderCard`** (`settings/EncoderCard.tsx`, mounted by `EncoderSection`, which reads `useEncoderLocked()` from `AccountContext`). A folded card (`ds/Disclosure`, closed by default) titled **Use your own DJ software**, "Optional. Skip this if you go live from the browser." There is no `#encoder` anchor any more. Three variants:

- Locked (plan has no encoder): a PRO tag in the title, description "Go live from BUTT, Mixxx or RadioDJ instead of the browser."; opened, one paragraph and an amber "Request Pro" (`ProRequestContext`; label becomes "Request sent"). `useEncoderLocked()` is `plan !== null && !plan.encoder_enabled`, so it is false while the plan is still loading.
- Unavailable (plan allows it, `encoder` absent): "Own-software broadcasting isn't available on this server yet."
- Available: the "Pick Icecast 2 … fill in these five values" instruction, `EncoderConnection`, a **New key** button ("Pasted your key somewhere public? Make a new one."; confirm dialog "Generate a new stream key?", then POST, toast, `router.refresh()`), four folded questions (turn the station on first; Shoutcast doesn't work; does a new key kick me off; is this connection private) and a "Still not connecting?" link to `/help/my-encoder-wont-connect` (new tab). After rotating, the card holds the response's `{key, rotated_at}` as an override and reveals the key, dropping the override when the refreshed prop's `rotated_at` is at or after it (handles out-of-order refreshes).

**`EncoderConnection`** (`components/dashboard/EncoderConnection.tsx`, now used only by the settings card): presentational. Five rows on inset wells (Server, Port, Mount, Username, Password), values shown in full (wrapping with `break-all`, not truncated), each with a Copy button that uses `copyText()` (`client/lib/clipboard.ts`: Clipboard API, falling back to a hidden-textarea `execCommand('copy')` for plain-http LAN pages); "Copied" for a moment, a toast to copy by hand when both fail. Password is masked as 16 bullets with a Show/Hide button (`revealed` is controlled by the parent). `password === null` renders "Unavailable" with the hint that the server can no longer read the key and to choose New key, with no copy button. A folded "Where these go in BUTT, Mixxx and ffmpeg" gives per-client steps (BUTT mountpoint without the leading slash; Mixxx host without `http://`; ffmpeg command with a literal `KEY` placeholder, not the real key).

**Going live from an encoder**: there is no encoder path in the dashboard's go-live flow any more (the old `GoLiveTrigger` picker and its `ConnectionWatcher` were removed with the 2026-10-01 redesign). Go live is the browser studio; an encoder simply connects with the settings values while the station is on.

**Overview hero** (`stationHero`): `liveFromEncoder = broadcasterAttached && live_source.type === 'external'`; title "You're live from {client}." (or "your DJ software"); text "Stop broadcasting in {client} to end the show."; the studio button is replaced by "Hear your stream ↗", and the stop button stays. `station_is_live_external` from a stop opens "Cut off this broadcast?" (Leave it on air / Cut it off, which retries with `force`), telling the owner to choose New key in settings afterwards. The status band says "You're live from your DJ software."

**Pricing** lists encoder ingest as a Pro feature (`components/homepage/PricingSection.tsx`); Help has `broadcast-from-butt-or-mixxx` and `my-encoder-wont-connect` (`client/app/(marketing)/help/_content/`). `UserResource` exposes `plan.encoder_enabled` to the client.

**Mobile**: **no encoder credentials or setup** appear in the app. It only labels an encoder broadcast: `liveSourceLabel()` in `mobile/src/components/station/overview.tsx` (the Overview tab's hero; `mobile/src/app/station/[slug]/index.tsx` decides `attached`) returns "LIVE FROM AN ENCODER" for `live_source.type === 'external'`, and its power control (`mobile/src/components/station/usePower.ts`) handles `station_is_live_external` with the same force-stop confirmation as the web ("Cut the broadcast off?" / "Cut it off", retrying the stop with `force: true`).

**Admin**: the rotation appears on the station timeline as `stream_key_rotated`; `live_connected` events carry `via` and `client`.

## Gaps and traps

1. **Rotation leaves an on-air encoder connected, but probably silences its titles.** Harbor authenticates the audio socket once. The metadata requests (connections 5 and 6) also carry `Authorization` and, per the router comments and `verify-ingest.sh` check 4, are authenticated by harbor too. After a rotation the on-air encoder keeps sending audio with the old key while its title updates start getting 401. (Whether harbor really authenticates the metadata requests, and whether it calls the auth callback for them, is Liquidsoap runtime behaviour: the repo only shows that `verify-ingest.sh` check 4 sends `Authorization` and reports a 401 as "harbor authenticates this request too". Needs a live station to confirm.)
2. **Metrics may count more than connects.** If harbor calls `harbor_auth` for the metadata updates, `allowed{method="key"}` counts one per track change as well as one per audio connect. The counter is "auth calls", not "broadcasts".
3. **`address` in harbor-auth refusals is always the router's bridge IP** for encoders (raw TCP splice, no PROXY protocol). A leaked-key incident is a wall of refusals from one 172.x address. The real IP exists only in the router's `ingest` access log (`$remote_addr`). Documented in `HarborAuthController::refuse()` and `nginx.conf`. For the same reason an encoder broadcast's `stream_sessions.ip_address` and `country` stay null (they come from `BroadcastOrigin`, i.e. the broadcast-token request, which only the studio and the app make), so the admin stations list shows no IP for it.
4. **A stopped station looks like a wrong key.** The router closes the connection with no reply on DNS failure or refusal; the encoder shows a socket error. The dashboard says so in the settings card's first folded question ("Turn the station on first?") and the help page `my-encoder-wont-connect` says an encoder does not switch the station on, but nothing in the router reports it. Encoders also never start a station.
5. **Credential-less SOURCE is not counted.** Connection 2 (and any scanner sending a bare `SOURCE`) is answered 401 by harbor itself and never reaches Laravel, so `refused{method="none"}` undercounts probing.
6. **The token path skips the plan check on purpose**, but it means "plan" refusals only ever describe stream keys. Free stations still hold a (unused) stream key: minted at creation for every plan.
7. **Key is stored reversibly and shown in plaintext** to the owner on Station settings (and in every `show()` payload), and travels in `Authorization: Basic` over an unencrypted TCP port (the card says so). No TLS ingest exists.
8. **One key per station, no per-DJ keys, no revocation short of replacing it.** Anyone holding the key can broadcast; there is no allowlist and no IP restriction.
9. **`limit_conn 10` per source IP** on 8000. A shared NAT (campus, venue) with several encoders could hit it, and the symptom is the same intermittent `shout_open() failed: err=Socket error` as a bad key.
10. **Router config is not part of a normal deploy.** `nginx.conf`/`ingest.js` are bind-mounted; `deploy-native.sh` only prints a manual step (`setup-native.sh`), and the restart that applies it drops on-air encoders and the studio proxy too. `setup-native.sh` runs `up -d --build`; whether compose recreates the container for a bind-mounted file edit alone was not tested, so confirm the router actually restarted. The nginx and njs versions must be bumped together or the container will not start and the studio path goes down too.
11. **Any uppercase-verb line with `/{slug}` is forwarded**, including HTTP from browsers; harbor decides. The slug regex is the only thing standing between client input and a dialled hostname, so change it with care.
12. **Docker publishes 8010 in front of ufw.** `ufw status` is not evidence the port is closed; only removing the `ports:` line closes it.
13. **PUT is deliberately not advertised**, so every libshout client uses `SOURCE`; a client that sends `PUT` anyway is forwarded to harbor (untested here).
14. **`verify-ingest.sh` is manual and uses `nc`.** Nothing in CI exercises the router or the wire shapes; the PHP tests cannot reach it. Its optional real-audio step (`GOCAST_AUDIO_TEST=1`, needs gstreamer) puts the key in `ps` for 25 seconds. The key must be passed via `GOCAST_STREAM_KEY` or a prompt; a 4th argument is refused.
15. **Encoder-only stations with no AutoDJ** are not covered by the 150 s studio-gone shortcut; they fall to the general silence window (`silent_stop_seconds`, default 600, see [Station lifecycle](station-lifecycle.md)).
16. **Mobile has no encoder setup**, so an owner on the app can only see that an encoder is live, not get the credentials.
17. **Stale doc references:** the header comment of `nginx.conf` says it "replaces exactly one line of api/Caddyfile" and the router is described as a bare proxy; the file now also carries the whole ingest path. Treat the code as the truth.

## Tests

| File | Covers |
|---|---|
| `api/tests/Feature/HarborAuthTest.php` | Internal-key gate; studio token accepted; encoder key accepted; key refused on a plan without encoder and after plan expiry; studio unaffected on free; wrong key, cross-station key, no key, empty credential, unknown and soft-deleted station refused; DB down refuses instead of 500; credential never written to the log; counters per outcome/method. |
| `api/tests/Feature/StreamKeyRotationTest.php` | Rotate returns a new key; timestamp; plan gate; non-owner and unauthenticated refused; timeline row has no key. |
| `api/tests/Feature/StationEncoderResourceTest.php` | `encoder` block for a Pro owner; omitted in lists, for a non-encoder plan, when no host is configured, on the public endpoint and for other accounts. |
| `api/tests/Feature/EncoderSessionAttributionTest.php` | `via`/`client` become `source_type`/`client`; studio refused while an encoder holds the station; stop refuses with `station_is_live_external`; force cut-off closes the session; a studio broadcast cannot be force-stopped; ghost encoder sessions. |
| `api/tests/Feature/MetricsControllerTest.php` | The `gocast_harbor_auth_total` series. |
| `infra/native/verify-ingest.sh` | Manual four-step wire test (OPTIONS probe, credential-less SOURCE 401, authenticated SOURCE 200, POST metadata rewrite "Updated metadatas"). Run after every router change: `GOCAST_STREAM_KEY=... bash infra/native/verify-ingest.sh <host> <port> <slug>` with the station switched on. |

There is no automated test for `ingest.js` or `nginx.conf`.

## History

Built 2026-09-15 (the header comment of `ingest.js` dates the libshout capture); the four libshout behaviours above were captured that day. Later: the studio and encoder share one harbor input; harbor buffer cut 12 s to 5 s and dead-air guard removed (2026-09-19/24).
