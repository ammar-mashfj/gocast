# Stations & Streaming API Reference

Base URL: `http://localhost:8000/api`
All requests require `Accept: application/json` header.
All endpoints below require `Authorization: Bearer {token}` unless marked as public.

---

## Station Object

```json
{
  "id": "019d54ec-f0b5-73b3-bd89-037544b4e385",
  "user_id": 1,
  "name": "Jazz FM",
  "slug": "jazz-fm",
  "description": "Smooth jazz all day",
  "genre": "Jazz",
  "artwork_url": null,
  "is_live": false,
  "is_on_air": false,
  "now_playing": null,
  "desired_state": "stopped",
  "started_at": null,
  "state": "offline",
  "icecast_mount": "/stream/jazz-fm",
  "watermarked": true,
  "jingles_enabled": false,
  "jingle_mode": "interval",
  "jingle_interval_seconds": 1800,
  "jingle_every_tracks": 5,
  "social_links": null,
  "theme_config": null,
  "created_at": "2026-04-03T19:46:48.000000Z",
  "updated_at": "2026-04-03T19:46:48.000000Z"
}
```

---

## CRUD (protected)

### List User's Stations
```
GET /api/stations

→ 200  { "data": [ ...station objects ] }
```

### Create Station
```
POST /api/stations

Body:
{
  "name": "required, string, max 100",
  "slug": "required, string, max 60, unique, regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/",
  "description": "optional, string",
  "genre": "optional, string, max 255"
}

→ 201  { "data": { ...station } }
→ 403  Station limit reached for current plan
→ 422  { "message": "...", "errors": { "slug": ["..."], ... } }
```

### Show Station
```
GET /api/stations/{uuid}

→ 200  { "data": { ...station } }
→ 403  Not your station
```

### Update Station
```
PUT /api/stations/{uuid}

Body (all fields optional):
{
  "name": "string, max 100",
  "slug": "string, max 60, unique, same regex as create",
  "description": "string",
  "genre": "string, max 255",
  "social_links": {},
  "theme_config": {}
}

→ 200  { "data": { ...station } }
```

### Delete Station
```
DELETE /api/stations/{uuid}

→ 200  { "message": "Station deleted." }
```

---

## Power & Status (protected)

A station holds a Liquidsoap container — and therefore an Icecast mount,
memory and CPU — only while it is on air. Creating a station does **not**
start one: `desired_state` is `stopped` until the owner presses start.

`state` on the station object is the cheap answer (no container round-trip)
and is one of `offline`, `on_air`, `live`. The status endpoint below asks the
container itself and can additionally return `starting`.

### Put a Station On Air
```
POST /api/stations/{slug}/start

→ 202  { "data": { ...station, "desired_state": "running" } }
→ 403  Not your station
→ 422  { "message": "...", "code": "station_limit_reached" }
```

Idempotent: starting an already-running station does not restart it (a
restart would drop connected listeners). Returns as soon as the container is
spawned — poll the status endpoint for readiness.

### Take a Station Off Air
```
POST /api/stations/{slug}/stop

→ 200  { "data": { ...station, "desired_state": "stopped" } }
→ 409  { "message": "...", "code": "station_is_live" }   # end the broadcast first
```

### Skip the Current AutoDJ Track
```
POST /api/stations/{slug}/skip

→ 200  { "message": "Skipped." }
→ 409  { "code": "station_not_running" }
→ 503  { "code": "station_unreachable" }   # container still booting
```

### Live Status (read from the container)
```
GET /api/stations/{slug}/status

→ 200
{
  "data": {
    "slug": "jazz-fm",
    "state": "on_air",              // offline | starting | on_air | live
    "desired_state": "running",
    "started_at": "2026-08-15T09:12:00.000000Z",
    "reachable": true,              // did the container answer?
    "ready": true,                  // audio is actually flowing
    "source": "autodj",             // live | autodj | silence
    "now_playing": { "title": "Blue in Green", "artist": "Miles Davis" },
    "elapsed": 42.2,
    "remaining": 128.4,
    "playlist_length": 12,
    "up_next": [
      { "id": "01H...", "title": "So What", "artist": "Miles Davis" }
    ]
  }
}
```

Broadcast clients should call `start`, then poll this until `ready` is true
before publishing WHIP — otherwise the first seconds of a broadcast land in a
container that has not finished building its audio chain.

---

## Stream Token (protected)

Used by the broadcaster page before connecting to the relay WebSocket.

```
POST /api/stations/{uuid}/stream-token

→ 200
{
  "data": {
    "token": "64-char random string",
    "expires_in": 300
  }
}
```

**Flow:** Frontend calls this → gets token → sends token to relay WebSocket as auth message → relay validates token against API → token is single-use (consumed on validation).

---

## Stream Sessions (protected)

### Start Session
```
POST /api/stations/{uuid}/sessions

→ 201  { "data": { ...session }, "message": "Stream started." }
→ 409  { "message": "Station is already live." }
```

### End Session
```
DELETE /api/stations/{uuid}/sessions/{session_uuid}

→ 200  { "data": { ...session with ended_at set }, "message": "Stream ended." }
```

### List Sessions
```
GET /api/stations/{uuid}/sessions

→ 200  Paginated response
{
  "current_page": 1,
  "data": [
    {
      "id": "uuid",
      "station_id": "uuid",
      "started_at": "2026-04-03T19:50:04.000000Z",
      "ended_at": "2026-04-03T20:30:00.000000Z",
      "peak_listeners": 0,
      "total_listener_minutes": 0,
      "source_type": "browser"
    }
  ],
  "per_page": 20,
  "total": 1
}
```

---

## Public Endpoints (no auth)

### Get Station by Slug
```
GET /api/public/stations/{slug}

→ 200  { "data": { ...station } }
→ 404  Station not found
```

### Get Listener Count
```
GET /api/public/stations/{slug}/listeners

→ 200  { "data": { "count": 42 } }
```

---

## Broadcaster → Relay WebSocket Flow

1. Frontend calls `POST /api/stations/{uuid}/stream-token` → gets `token`
2. Frontend calls `POST /api/stations/{uuid}/sessions` → starts session, gets `session_id`
3. Frontend opens WebSocket to `ws://localhost:8080`
4. Sends auth: `{ "type": "auth", "stationId": "uuid", "token": "token" }`
5. Relay responds: `{ "type": "authenticated", "stationId": "uuid" }`
6. Frontend sends binary MP3 data (audio chunks from lamejs encoder)
7. To update metadata: `{ "type": "metadata", "title": "Song Name", "artist": "Artist" }`
8. On stop: close WebSocket, then call `DELETE /api/stations/{uuid}/sessions/{session_id}`

---

## Jingles

Station IDs and liners live in the same `tracks` table as the AutoDJ rotation,
separated by a `kind` column (`music` | `jingle`). They share the station's
storage cap, the upload endpoint, and the `autodj_enabled` plan gate — `kind`
is the only thing that differs.

Every list-scoped track endpoint takes an optional `kind`, defaulting to
`music`, so a client that never sends it behaves exactly as before:

| Request                                                        | Effect                                    |
|----------------------------------------------------------------|-------------------------------------------|
| `GET  /api/stations/{slug}/tracks?kind=jingle`                  | List the jingles                          |
| `POST /api/stations/{slug}/tracks` with `kind=jingle`           | Upload into the jingle list               |
| `PATCH /api/stations/{slug}/tracks/reorder` with `kind=jingle`  | Accepted, but ordering is not meaningful  |

Positions are gap-free per **(station, kind)** — the two lists number
independently, and a reorder request may only reference ids of the kind it
declares.

Scheduling is four station columns, updated through the normal
`PATCH /api/stations/{slug}`:

| Field                     | Rules                          | Meaning                                  |
|---------------------------|--------------------------------|------------------------------------------|
| `jingles_enabled`         | boolean                        | Master switch                            |
| `jingle_mode`             | `interval` \| `tracks`         | How jingles are spaced                   |
| `jingle_interval_seconds` | integer, 60 – 14400            | Gap in `interval` mode                   |
| `jingle_every_tracks`     | integer, 1 – 100               | Gap in `tracks` mode                     |

Both mode settings are stored regardless of which is active, so switching modes
back and forth doesn't lose the other one's value.

**`interval`** — "every 30 minutes". Predictable in wall-clock terms, which is
what legal IDs and sponsor reads are specified in, and unaffected by how long
the station's tracks are. The trade-off is that the real gap drifts past the
setting on a station playing long tracks, because the jingle still waits for a
boundary.

**`tracks`** — "every 5 tracks". Even musical density, which is what the owner
hears, at the cost of real-world spacing that swings with track length.

Either way the setting is a **floor, not a schedule**: the jingle plays at the
first track boundary *after* the gate opens, and never cuts into a song. Jingles
are also always hard cut (never crossfaded) and excluded from the now-playing
push, so the player keeps showing the last real track while an ID is on air.

**None of these restart the station.** All four are declared as Liquidsoap
interactive variables, so a change is pushed to the running container over
telnet (`var.set jingles_enabled = true`) and takes effect at the next track
boundary — nobody listening is disconnected. That includes switching modes:
the script carries both gates at once and neutralises whichever the active mode
isn't using, precisely so the mode itself can change without a new graph. The values are also rendered into
the script as its initial state, so a stopped or unreachable station picks them
up whenever it next boots; the telnet push is a fast path, the database row is
the source of truth.

Uploading and deleting jingles does not restart anything either — that is a
playlist reload, same as the rotation.

---

## Free-tier watermark

A short platform-owned clip ("powered by GoCast") mixed **over** the station
every few minutes, ducking whatever is playing rather than replacing it. Driven
entirely by `plans.watermark_enabled`.

There is deliberately **no station column and no writable API field**. It is
reported on the station object as a read-only `watermarked` boolean, and only to
the owner — publishing it would tell the internet which stations are on the free
plan. Upgrading is the only way to remove it.

Note what it actually marks: free plans have `autodj_enabled = false`, so a free
station has no library and its AutoDJ is silence. In practice the watermark
rides over **live broadcasts** — over someone talking. That is why it ducks
instead of interrupting, why it sits after the live/AutoDJ fallback (applied any
earlier, going live would evade it), and why the defaults are conservative.

Tuning is install-level, not per-station:

| Env                             | Default | Meaning                                              |
|---------------------------------|---------|------------------------------------------------------|
| `LIQUIDSOAP_WATERMARK_ENABLED`  | `true`  | Fleet-wide kill switch, independent of any plan       |
| `LIQUIDSOAP_WATERMARK_INTERVAL` | `600`   | Seconds between watermarks (floored at 60)            |
| `LIQUIDSOAP_WATERMARK_DUCK`     | `0.15`  | Portion of station audio **kept** while it plays      |
| `LIQUIDSOAP_WATERMARK_FADE`     | `1.0`   | Ramp down/up seconds                                  |

The audio is whatever files sit in `/var/gocast/system/`, mounted read-only into
every container at `/data/system`. It is a directory, not a fixed filename:
several variants rotate at random, and an **empty directory simply means no
watermark** — a missing clip can never stop a station from starting.

Like the jingle settings this is hot: an upgrade pushes
`var.set watermark_enabled = false` to the user's running containers, so a
customer who has just paid stops hearing it within seconds and **their listeners
are not disconnected**. `UserObserver` fires that on any `plan_id` change, in
both directions.

Two things the watermark deliberately does not touch: `/status` and the
now-playing push both read the un-watermarked mix, so a platform ID never
appears as the station's current track.

---

## Plan Limits

Plans belong to the **user** (`users.plan_id` → `plans`), not to individual
stations. The seeded plans are `free` and `pro`; the columns below are the
live schema.

| Column                 | Meaning                                                            | free | pro |
|------------------------|--------------------------------------------------------------------|------|-----|
| `max_stations`         | Station rows the user may own                                       | 1    | 5   |
| `max_running_stations` | Stations that may be **on air at once** (each holds a container)     | 1    | 5   |
| `max_listeners`        | Concurrent listeners                                                | 25   | 500 |
| `autodj_enabled`       | May upload tracks and run an unattended playlist                    | no   | yes |
| `watermark_enabled`    | Stream carries the audible "powered by GoCast" ID                    | yes  | no  |

Enforcement points:

* `POST /api/stations/{slug}/start` and the WHIP auth hook →
  `max_running_stations` (`code: station_limit_reached`). Going live on a
  stopped station starts it, so the cap cannot be dodged by broadcasting.
* `POST /api/stations/{slug}/tracks` → `autodj_enabled`
  (`code: autodj_not_available`). Listing and deleting tracks stay open on
  every plan so a downgrade never traps a user's files.
* `stations:sweep` (every minute) → stops a station only when it is producing
  no audio and has nothing attached that could produce any. Listener count is
  not an input, so an AutoDJ rotation playing to an empty room is never
  stopped; `autodj_enabled` is consulted only to tell a broken rotation
  (reported, not stopped) from a station with nothing to play.

Slug format: lowercase letters, numbers, hyphens only. Regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
