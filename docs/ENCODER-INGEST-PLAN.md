# External encoder ingest — implementation plan

Lets a Pro station be broadcast to from BUTT, Mixxx, RadioDJ, ffmpeg, or any
other client speaking the **Icecast 2 source protocol**, alongside the existing
browser studio.

Status: **built, 2026-09-15.** Every phase below is implemented and verified
against a real libshout client. Uncommitted.

This supersedes the "What to build" section of
[`USER-FLOW-UPGRADES.md` §3](./USER-FLOW-UPGRADES.md), whose claim that the work
needs "no new infrastructure" is wrong — see Phase 3.

---

## What the spike found that this plan got wrong

The plan below is left as written, because the reasoning still holds and the
shape was right. Four things about real clients were not, and each one was the
difference between "works" and "appears to work":

1. **libshout opens with `OPTIONS * HTTP/1.1`, and a reset is fatal.** The plan
   assumed the OPTIONS probe was something harbor simply never answers, so
   nothing happens. In fact libshout sends it on its own connection before
   anything else, and closing that connection kills the entire connect —
   `shout_open() failed: err=Socket error`. It never sends `SOURCE` at all. The
   router now answers the probe itself, from a loopback server in its own http
   block, with an `Allow:` header that deliberately omits PUT.

2. **Metadata is POSTed with a form body, and harbor cannot read it.** Phase 3
   listed this as a risk to check. It is worse than the plan allowed for: not
   only is the mount in the body rather than the query, harbor parses its
   arguments from the query string ONLY and answers libshout's own metadata
   request `unrecognised command`. Routing it correctly is not enough — the
   router rewrites the POST into the GET harbor parses. Without that, encoder
   audio works and now-playing is frozen for the whole show.

3. **Harbor does not lowercase the connect headers.** Liquidsoap's own
   documentation for `on_connect` says "All labels are lowercase". Against the
   2.4.5 image they arrive exactly as the client spelled them —
   `Authorization`, `User-Agent`, `Content-Type` — so `list.assoc("user-agent",
   ...)` matches nothing and every encoder session reports an empty client. The
   template normalises before looking anything up.

4. **`s.send()` does not work in an njs preread handler** (`cannot send buffer
   in this handler`, njs 0.9.6). The plan's `refuse()` cannot explain itself,
   and the Phase 6 plan to answer a powered-off station with
   `403 station is off` is not possible on that path. It matters less than it
   looks: after (1) and (2), nothing a DJ does wrong reaches that code — a bad
   password gets a real 401 from harbor, and a switched-off station fails at
   DNS.

Two smaller corrections: the ingest port cannot be 8000 (`ICECAST_PORT` has it,
and `php artisan serve` has it in local development), so it is configurable and
defaults to 8010; and the cold-start hole Phase 6 worried about is bounded by
`silent_stop_seconds`, which is ten minutes, not the sixty seconds the policy's
fallback default suggests.

`infra/native/verify-ingest.sh` is the regression suite for all of this — it
replays the four wire shapes in the order libshout sends them and names which
one broke.

---

## Why this is not just an auth change

`HarborAuthController` accepts exactly one credential: the 60-second token from
`BroadcastTokenService`. That is the obvious gap and it is the *small* half.
The larger half is that **an Icecast source client cannot reach harbor at all
today**, and cannot be made to over the existing HTTP path.

Verified against libshout's own source (`src/proto_http.c:106`):

```c
if (connection->server_caps & LIBSHOUT_CAP_PUT) {
    shout_queue_printf(connection, "PUT %s HTTP/1.1\r\n", mount);
} else {
    shout_queue_printf(connection, "SOURCE %s HTTP/1.0\r\n", mount);
}
```

`CAP_PUT` is only set when the server advertises `PUT` in an `Allow:` header
during an `OPTIONS` probe. Harbor registers no OPTIONS handler, so it never
advertises, so **every libshout client — Mixxx, BUTT — sends
`SOURCE /mount HTTP/1.0`**: a non-HTTP verb, HTTP/1.0, with no `Content-Length`
and no `Transfer-Encoding`. nginx cannot frame that body, concludes there is
none, and the audio bytes are never read. The failure mode is a connection that
*appears* to succeed and carries silence.

So ingest for encoders has to be routed at the TCP layer. That is Phase 3 and
it is the only genuinely new infrastructure here.

### What harbor already supports

From `liquidsoap/src/core/net/harbor.ml:298`:

```ocaml
type source_type = [ `Put | `Post | `Source | `Xaudiocast | `Shout ]
```

PUT, POST, SOURCE, Icecast 1 and ICY all work, `Authorization: Basic` is parsed,
and `input.harbor(..., icy=true)` in our template is already correct. **No
Liquidsoap change is needed for the transport.** The only template change in
this plan is Phase 4 (attribution), which is optional for the audio to work.

### Two wire shapes, not one

Metadata arrives on a **separate connection**, addressed differently
(`libshout/src/shout.c:357`, `harbor.ml:884`):

```
SOURCE /my-station HTTP/1.0                                   ← audio, mount in the PATH
GET /admin/metadata?mode=updinfo&mount=%2Fmy-station&song=…   ← titles, mount in the QUERY, url-encoded
```

Harbor resolves the mount from the query args for the second. **A router that
only matches the path will stream audio with now-playing frozen forever** —
precisely the bug `station.blade.php:224` documents having already fixed once
for the browser path. Both shapes are required.

---

## Phase 0 — Spike (half a day, throwaway)

Prove the transport before building any product surface. Every later phase is
wasted if this fails.

1. `stream` block + njs in `infra/native/station-router/`, published on 8000.
2. Temporarily accept a hardcoded password in `HarborAuthController` — no
   migration, no UI, no plan gate.
3. Point real Mixxx at it: host, port 8000, mount `/{slug}`, login `source`,
   server type **Icecast 2**.

**Exit criteria — all five:**

| # | Check | Proves |
|---|-------|--------|
| 1 | Audio plays on the station page | the `SOURCE` route works |
| 2 | Track titles update in now-playing | the `/admin/metadata` route works |
| 3 | Station reads live in the dashboard | `live_connected` → `StreamSession` |
| 4 | Kill wifi mid-broadcast → reconnects | `LIQUIDSOAP_HARBOR_INPUT_TIMEOUT` is sane |
| 5 | Repeat 1–4 with BUTT | not a libshout-version accident |

Confirm the njs `upload` callback receives **chunks, not the accumulated
buffer** (nginx's own `auth_request` example does `collect += data`), and that
`js_var` + `s.variables` assignment works as documented.

Then delete the hardcoded auth.

**If it fails:** `input.harbor.dynamic.regexp` (first-party, already in the
image) or HAProxy drops in behind the same hostname and port. Phases 1, 2, 4–7
are unaffected — the user-facing contract is host/port/mount either way.

---

## Phase 1 — Plan entitlement and the stream key

### 1.1 Plan flag

Migration `add_encoder_enabled_to_plans_table`, modelled exactly on
`2026_09_08_100000_add_embed_enabled_to_plans_table.php`:

```php
$table->boolean('encoder_enabled')->default(false)->after('embed_enabled');
DB::table('plans')->where('slug', 'free')->update(['encoder_enabled' => false]);
DB::table('plans')->where('slug', 'pro')->update(['encoder_enabled' => true]);
DB::table('plans')->whereNotIn('slug', ['free', 'pro'])->update(['encoder_enabled' => true]);
```

`Plan::casts()` gains `'encoder_enabled' => 'boolean'`.

`User::canUseEncoder(): bool` alongside `canEmbed()`, same null-coalescing
convention (no plan row = free = no encoder):

```php
return (bool) ($this->plan?->encoder_enabled ?? false);
```

### 1.2 Stream key column

Migration `add_stream_key_to_stations_table`:

- `stream_key` — `text`, nullable, **`encrypted` cast**.
- `stream_key_rotated_at` — nullable timestamp.

**Encrypted, not hashed.** The settings card must redisplay it; people re-read
encoder settings months later and a show-once secret guarantees a support
ticket. The trade is that `php artisan key:generate` makes existing keys
undecryptable — document it in the migration docblock next to the same warning
`BroadcastTokenService` already carries about APP_KEY.

Generation: `Station::creating` hook, beside the existing `desired_state ??=`
defaults at `Station.php:147`. `Str::random(32)`, charset restricted to
`[A-Za-z0-9]` — it travels in a URL query string on the metadata request and
through `Authorization: Basic`, and some encoder UIs mangle punctuation.

Backfill existing rows in the same migration.

`StationFactory` sets one, so factory-built stations behave like real ones.

### 1.3 Rotation endpoint

`POST /stations/{station:slug}/stream-key` → `StreamKeyController::rotate`.

- Authorised by the existing station-owner policy.
- Requires `canUseEncoder()` — 403 otherwise.
- `throttle:6,1`.
- Sets `stream_key` and `stream_key_rotated_at`, returns the new
  `StationResource`.
- Records a `StationEvent` (`stream_key_rotated`, source `user`) — admin
  monitoring only, never branched on.

**Rotation does not kick a connected broadcaster.** Harbor authenticates at
connect time only. Say so on the card rather than pretending otherwise.

---

## Phase 2 — Auth

`HarborAuthController` gains a second credential path. The two must not blur:
the token is MAC-verified with no DB hit; the key is a DB lookup and a
`hash_equals`.

**Order matters — token first.** It is the hot path (every studio connection)
and it costs no query.

```
if token verifies              → allow  (method: token)
elseif station has a stream_key
     and hash_equals(key)
     and owner->canUseEncoder() → allow  (method: key)
else                            → refuse
```

Notes:

- The station lookup already exists for the "unknown station" check; reuse that
  query rather than adding a second.
- Eager-load `user.plan` on it — this runs once per connection attempt and
  `canUseEncoder()` would otherwise be a second query.
- **The plan gate lives here, not only in the UI.** A downgraded Pro user's
  encoder must stop working at the next connection, exactly as
  `embed_enabled` 404s the embed page.
- Keep failing closed on every path, including an unreachable DB.
- Extend the existing `Log::info` refusal with `method => token|key|none`.
  **Never log the credential itself** — the current code logs `user` and
  `address` only; keep it that way, and add `stream_key` to Sentry's scrub list.

### Tests — `HarborAuthTest.php` (new)

| Case | Expect |
|------|--------|
| valid ephemeral token | 200 |
| valid stream key, Pro owner | 200 |
| valid stream key, free owner | 403 |
| valid stream key, plan expired | 403 |
| wrong stream key | 403 |
| stream key for another station's slug | 403 |
| station has no stream key set | 403 |
| empty password | 403 |
| unknown slug | 403 |
| deleted (soft-deleted) station | 403 |
| DB unreachable | 403, not 500 |
| refusal log contains no credential | assert on `Log::spy()` |

---

## Phase 3 — Routing

The only new infrastructure. It extends the **existing** `station-router`
container rather than adding a service.

### 3.1 Container

`infra/native/station-router/Dockerfile`:

```dockerfile
FROM nginx:1.29-alpine
RUN apk add --no-cache nginx-module-njs=<pinned to the nginx version>
```

The container stops being a pure config mount. Pin the module to the nginx
version; a drift there is a container that will not start.

### 3.2 `ingest.js`

Per-connection closure — **not** the module-level global nginx's own
`detect_http` example uses, which races across concurrent connections.

```js
var AUDIO = /^[A-Z]+ \/([a-z0-9][a-z0-9-]{0,62}) (HTTP\/1\.[01]|ICE\/1\.0)/;
var META  = /^GET \/admin\/metadata\?[^\s]*mount=(?:%2F|\/)([a-z0-9][a-z0-9-]{0,62})(?:[&\s])/i;

function route(s) {
    var buf = '';
    s.on('upload', function (data, flags) {
        buf += data;                       // chunks, not accumulated — see Phase 0
        if (buf.indexOf('\r\n') < 0) {
            if (buf.length > 2048 || flags.last) return refuse(s, 400);
            return;
        }
        var m = buf.match(AUDIO) || buf.match(META);
        if (!m) return refuse(s, 400);
        s.variables.station_upstream = 'gocast-liquidsoap-' + m[1] + ':8090';
        s.done();
    });
}
```

- The slug regex is a **security boundary**, not tidiness: the capture becomes a
  hostname to dial. Anchored and charset-limited, identical to the one already
  in `gocast-stream.conf`.
- `refuse()` should `s.send()` an `HTTP/1.0 4xx` line before `s.deny()`, so a
  client shows a reason instead of a bare reset.
- **Spike check:** whether libshout sends metadata as GET-with-query or
  POST-with-form-body (`shout.c` builds both shapes; harbor accepts either). If
  POST, the mount is in the body and `META` needs a body branch —
  `Content-Length` is present and small, so preread can reach it.

### 3.3 nginx

```nginx
stream {
    js_import ingest from ingest.js;
    js_var $station_upstream;
    resolver 127.0.0.11 valid=10s ipv6=off;
    limit_conn_zone $binary_remote_addr zone=ingest_per_ip:1m;

    log_format ingest '$remote_addr $station_upstream $status $bytes_received';
    access_log /dev/stdout ingest;

    server {
        listen 8000;
        limit_conn ingest_per_ip 4;
        preread_buffer_size 4k;
        preread_timeout 5s;
        js_preread ingest.route;
        proxy_pass $station_upstream;
        proxy_timeout 24h;
    }
}
```

`resolver` with a short `valid=` for the same reason the HTTP block documents:
a restarted station comes back on a new IP.

### 3.4 Compose, setup, firewall

- `docker-compose.native.yml`: publish `"8000:8000"` (all interfaces, unlike the
  existing `127.0.0.1:8091`). Raise the 64M memory limit — splicing is cheap,
  but njs adds a VM.
- Healthcheck: the HTTP `/healthz` on 8091 still covers liveness. Optionally add
  a TCP check on 8000.
- `setup-native.sh`: `__INGEST_PORT__` templating beside `__ROUTER_PORT__`.
- **Firewall:** Docker's published-port rules sit *in front of* ufw's INPUT
  chain, so 8000 is reachable whether or not ufw says so. Document it; do not
  rely on ufw to gate it.

### 3.5 Config for display

`config/liquidsoap.php`, beside `ingest_url`:

- `encoder_host` — `LIQUIDSOAP_ENCODER_HOST`, the hostname DJs type.
- `encoder_port` — `LIQUIDSOAP_ENCODER_PORT`, default 8000.

Unset `encoder_host` means the feature is not deployed here: the API omits the
connection block and the UI says so rather than printing a host that does not
resolve. Local dev can point it at the host's LAN IP.

---

## Phase 4 — Attribution

> **The only phase that edits the `.liq` template**, and therefore the only one
> that needs `stations:relaunch`. See [Deploy and rollout](#deploy-and-rollout).

`stream_sessions.source_type` **already exists** (`browser|electron|external`,
migration `2026_04_03_193412`), is on the resource, is typed in
`client/interfaces/StreamSession.ts`, and is already rendered on the station
overview by `RecentBroadcasts.tsx:15` as Studio / Desktop / **Encoder**.

But `StationEventController.php:138` hardcodes it:

```php
$session = $station->streamSessions()->create([
    'started_at' => now(),
    'source_type' => 'browser',      // ← every encoder session mislabelled "Studio"
]);
```

That is the only path an encoder can take — an encoder makes no API call of its
own — so without this phase the feature ships with a wrong label in the one
place a user looks to confirm it worked.

### 4.1 Template

`station.blade.php:272` currently discards the headers:

```liquidsoap
live_in.on_connect(synchronous=false, fun (_) -> ...)
```

Verified signature from the image:

> `on_connect : (synchronous : bool, (([string * string]) -> unit)) -> unit` —
> *"Its receives the list of headers, of the form: (<label>,<value>). All labels
> are lowercase."*

Both paths carry them (`harbor.ml:704` source protocol, `:836` websocket), so
the split is unambiguous:

| Studio | Encoder |
|--------|---------|
| `upgrade: websocket` | `user-agent: libshout/2.4.6` |
| `sec-websocket-protocol: webcast` | `content-type: audio/mpeg` |
| browser UA | `ice-name`, `ice-public` |

**⚠ That header list contains `authorization: Basic <base64 of source:streamkey>`.**
Allowlist `user-agent`, `content-type`, `upgrade` **inside the template**, before
anything leaves the container. Never forward the list wholesale — it would put
the stream key in Laravel's logs and in Sentry.

`notify()` gains an optional properties argument; `live_connected` sends the
allowlisted pairs.

### 4.2 Controller

- Extend validation: `client` (nullable string, max 255), `via`
  (nullable, `in:browser,external`). Unknown/absent → `browser`, preserving
  today's behaviour for any container not yet re-rendered.
- `openSession()` takes the derived type and drops the hardcode.
- Pass `client` into `StationEvent::record(..., properties: [...])` so the admin
  timeline carries it too.

### 4.3 Optional column

`stream_sessions.client` (nullable string) to keep "Mixxx 2.5" / "BUTT 1.4" per
session. Worth it for support; the enum alone already lights up the existing UI.

### Tests

- `live_connected` with libshout-ish headers → session `source_type = external`.
- With websocket headers → `browser`.
- With no headers (old container) → `browser`.
- Authorization header present in payload → **rejected or stripped**, and
  asserted absent from logs.
- Existing `StationEventControllerTest` continues to pass untouched.
- `LiquidsoapTemplateTest`: rendered script contains the allowlist and does not
  contain `authorization`.

---

## Phase 5 — API and UI

### 5.1 `StationResource`

Owner-only *and* entitlement-gated, following the `watermarked` pattern at
`StationResource.php:166` — including its N+1 discipline (read the plan off
`$request->user()`, never off each row's owner):

```php
'encoder' => $this->when(
    $request->user()?->id === $this->user_id && $request->user()->canUseEncoder(),
    fn () => [
        'host'     => config('liquidsoap.encoder_host'),
        'port'     => (int) config('liquidsoap.encoder_port'),
        'mount'    => '/'.$this->slug,
        'username' => 'source',
        'password' => $this->stream_key,
        'rotated_at' => $this->stream_key_rotated_at,
    ],
),
```

Omit the whole block when `encoder_host` is unset.

**`stream_key` must not appear in `UpdateStationRequest`** — same reasoning as
`watermarked`: a user must not be one PATCH away from setting their own
credential. Rotation is its own endpoint.

### 5.2 Settings card

New `Card` in `settings/page.tsx`, after **Stream**, following the existing
`streamFacts` label/value/hint layout. A client component for the copy buttons
and the rotate action.

Fields: Server, Port, Mount, Username, Password (masked with a reveal), plus
Regenerate.

Copy must state, because each of these is a support ticket otherwise:

- **Server type: Icecast 2.** Not Shoutcast — the ICY handshake carries no mount
  and cannot be routed (`harbor.ml:641`, ICY lives on port+1 and forces mount `/`).
- The station must be **powered on** before the encoder can connect.
- Rotating does not disconnect a live broadcast.
- The key is sent as HTTP Basic auth over a plain TCP connection. Say it; do not
  imply encryption we do not have.

Free users: show the card **locked** with an upgrade link. It is a Pro selling
point; hiding it sells nothing.

### 5.3 Overview page

`StationActivity` — the "what is on air?" panel — should say **Live from
Encoder** while it is happening. Recent Broadcasts already handles history but
is capped at `LIMIT = 5`.

---

## Phase 6 — Edges

| Edge | Behaviour | Decision |
|------|-----------|----------|
| **Station powered off** | Harbor lives inside the container; nothing is listening. The studio calls `ensureStationOnAir` first, an encoder cannot. | v1: njs `dial` failure returns `403 station is off — turn it on in your dashboard`. Do **not** auto-start from the ingest path: it would let an unauthenticated connection spin up containers. |
| **Swept while idle** | `StationAudioPolicy` returns `InUse` whenever `broadcaster === true`, so a *connected* encoder is never swept. The hole is the cold start: a Pro station powered on, no library, no broadcaster → `Silent` → stopped → the encoder then cannot connect. | v1: the 403 above covers it. Later: exempt stations with a `stream_key` from the sweep, or shorten the gap another way. |
| **Studio and encoder at once** | Harbor allows one source per mount; the second is refused. | Confirm the studio surfaces this as "someone else is already broadcasting", not a generic failure. |
| **Rotation mid-broadcast** | No effect until the next connect. | Documented on the card. |
| **Plan downgrade** | Next connection attempt 403s (Phase 2 gate). | Matches `embed_enabled`. |
| **Slug** | Immutable — `UpdateStationRequest:15` ignores any `slug` key. | No mount-drift risk. Nothing to do. |
| **Station deleted** | Key goes with the row; container is removed. | Nothing to do. |

### Observability

- Router logs the resolved upstream and byte count per connection.
- `MetricsController`: `gocast_ingest_refused_total` counter, so a spike in
  refusals is visible without reading logs.
- Keep the `Log::info` refusal reasons in `HarborAuthController` — they are the
  first thing any support conversation needs.

---

## Phase 7 — Copy

| File | Change |
|------|--------|
| `articles.ts:133` | "any standard radio encoder" → **Icecast 2**; "details come with your Pro onboarding" → "in your station settings" |
| `keep-your-radio-station-on-air-24-7.tsx:342` | same two changes |
| `PricingSection.tsx:19` | accurate as written — "any Icecast encoder" |
| `terms/page.tsx:31` | accurate as written |
| `README.md:9,32` | accurate, now verified at source level |
| anywhere | nothing may imply **OBS** works natively — its outputs are RTMP/SRT |

Add a help page: per-client setup for BUTT and Mixxx with real field values, and
a short "it won't connect" list (wrong server type, station off, firewall).

---

## Test plan summary

**New:** `HarborAuthTest` (12 cases, Phase 2) · `StreamKeyRotationTest`
(authz, entitlement, throttle, value changes, event recorded) ·
`EncoderSessionAttributionTest` (Phase 4).

**Extended:** `StationEventControllerTest` (source_type derivation) ·
`LiquidsoapTemplateTest` (header allowlist present, `authorization` absent) ·
`StationResource` tests (block present for Pro owner, absent for free owner,
absent for non-owner, absent when unconfigured) · `ArchitectureTest` (new
classes comply).

**Manual, and not skippable** — the automated suite cannot reach any of this:
Mixxx and BUTT end-to-end, metadata updates, mid-broadcast network drop and
recovery, powered-off station error text, wrong-password error text, and a
plan downgrade killing a live encoder's next reconnect.

Per project convention, run targeted test files rather than the whole API suite.

---

## Sequencing and effort

| Phase | Effort | Blocks | Touches |
|-------|--------|--------|---------|
| 0 · Spike | 0.5d | everything | throwaway |
| 1 · Plan flag + key | 0.5d | 2, 5 | migration |
| 2 · Auth | 0.5d | — | API only |
| 3 · Router | 0.5d | — | **infra** |
| 4 · Attribution | 0.5d | — | **.liq template** |
| 5 · API + UI | 0.5d | 1, 3 | API + client |
| 6 · Edges | 0.25d | — | mixed |
| 7 · Copy | 0.25d | — | client only |

**~2.5 days after a clean spike.** Phases 1–4 are independent once 0 passes.

---

## Deploy and rollout

### What each phase costs at deploy time

| Phase | Deploy action |
|-------|---------------|
| 1 · Plan flag + key | `migrate` — additive, no downtime |
| 2 · Auth | ordinary API deploy |
| 3 · Router | `sudo bash infra/native/setup-native.sh`, rebuild the router image (njs module), open port 8000 |
| **4 · Attribution** | **`php artisan stations:relaunch`** — see below |
| 5 · API + UI | ordinary deploy; needs `LIQUIDSOAP_ENCODER_HOST` / `_PORT` set first or the card stays hidden |
| 6, 7 | ordinary deploy |

### Why Phase 4 needs a relaunch

Phase 4 is the **only** change to `station.blade.php`. The rendered `.liq` is
bind-mounted per station (`mountFlags`: `-v {liqDir}/{slug}.liq:/station.liq:ro`)
and Liquidsoap cannot hot-reload its top-level audio graph — the docblock on
`LiquidsoapSupervisor::restart()` says so. **Running containers keep the old
script until they are recreated.**

`deploy-native.sh:247` already detects this and prints the manual step:

```
the station .liq template or supervisor changed — running stations keep
the OLD config until relaunched (~3s blip each, live DJs disconnect):
     sudo -u $RUN_USER php api/artisan stations:relaunch
```

`stations:relaunch` re-renders every `.liq` and recreates the container for
every station with `desired_state = running`. Powered-off stations pick the
change up whenever they are next started; newly created stations render fresh.
This is reason #3 in that command's own docblock.

**No inode trap, despite the single-file bind mount.** `File::put` is
`file_put_contents`, which truncates in place rather than writing a temp file
and renaming, and `restart()` is `down()` + `run()` — a full remove and
re-`docker run`, not `docker restart` — so mounts are rebuilt from scratch
either way. The restart is needed for Liquidsoap's sake, not Docker's.

### Two rollout shapes

**Split (zero interruption).** `input.harbor(..., icy=true)` in the containers
running *today* already accepts the Icecast source protocol, so the transport
needs no template change at all.

- **Deploy A** — Phases 1, 2, 3, 5, 6, 7. Encoders work on existing containers
  immediately. No restarts, no DJ disconnected.
- **Deploy B** — Phase 4 plus `stations:relaunch`, in a quiet window.

Cost of splitting: between A and B every encoder session shows as **"Studio"**
on the overview page — the `StationEventController:138` hardcode, shipped
knowingly for a window. That is a wrong label in exactly the place someone
checks whether their encoder worked, so keep the window short.

**Single (one blip).** Everything at once, then `stations:relaunch`. ~3s per
running station, live broadcasts drop and reconnect.

**Recommendation:** while Pro is hand-granted to a handful of beta stations,
ship it in one and relaunch. The split only earns its complexity once there are
live DJs worth not interrupting.

Precedent: the audio-based auto-stop rollout (2026-08-30) was inert until every
container had been recreated, for the same reason.

### Deploy order

1. `migrate` (Phase 1) — additive, safe ahead of any code.
2. Router infra (Phase 3) — `setup-native.sh`, image rebuild, port 8000. Nothing
   uses it yet, so it can land early and be smoke-tested alone.
3. Set `LIQUIDSOAP_ENCODER_HOST` / `LIQUIDSOAP_ENCODER_PORT`. Until these are
   set the resource omits the connection block and the UI says the feature is
   unavailable here — a safe default, and what local dev sees.
4. API + client (Phases 2, 5, 6, 7).
5. Phase 4 + `stations:relaunch`.

### Kill switch

`UPDATE plans SET encoder_enabled = 0 WHERE slug = 'pro';`

Every stream-key auth 403s at the next connection attempt, with no deploy and
no restart — the Phase 2 gate reads the plan on every call. Live broadcasts
continue until they reconnect, since harbor authenticates only at connect.

Blunter options, in order of severity: unset `LIQUIDSOAP_ENCODER_HOST` (hides
the card but leaves working keys working), or stop publishing port 8000 on the
router (kills ingest instantly, including mid-broadcast).

### Rollback

Phases 2–7 are ordinary code reverts. Phase 1's migration is additive and can
stay — an unused column is harmless, and dropping `stream_key` throws away
credentials users may already have pasted into their encoders. Revert the
template and `stations:relaunch` to undo Phase 4.

---

## Out of scope

Shoutcast/ICY (unroutable — no mount in the handshake) · TLS on the ingest port
· per-station published ports · the external Icecast relay (a separate
migration-tool feature) · SRT/RTMP ingest · a desktop app (the `electron` enum
value predates this work).

## Risks

| Risk | Mitigation |
|------|------------|
| njs behaves differently than documented | Phase 0 gates everything; `input.harbor.dynamic.regexp` and HAProxy are drop-in behind the same contract |
| Metadata is POSTed, not GET | Phase 0 exit criterion #2 catches it; body branch is a few lines |
| Support load — "it won't connect" is a firewall, an ISP, a wrong server type | Single hostname/port keeps the variable count low; help page and precise error text do the rest |
| Stream key crosses the wire in plaintext Basic auth | State it on the card. TLS on the ingest port is the later fix |
| APP_KEY rotation orphans every encrypted key | Document in the migration; rotation endpoint is the recovery path |
| An unauthenticated TCP port reaches container hostnames | Anchored slug regex, `limit_conn`, harbor still authenticates every connection |
