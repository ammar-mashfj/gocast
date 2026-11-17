# relay

The studio ingest. Two jobs on one binary:

- **Free** (`/relay`): a browser studio's WebSocket audio, written to Icecast
  byte for byte. No container, no decoding, no re-encoding. Why and how it
  fits: `docs/RELAY-SERVICE-PLAN.md`.
- **Container / Pro** (`/relay/broadcast/{slug}`): a pass-through to the
  station's harbor via the station router, plus pings. See
  [Container pass-through](#container-pass-through) below.

```
studio ──wss (webcast)──▶ nginx (relay.gocast.fm) ─▶ relay@1 :8095 / relay@2 :8096 ──PUT /stream/{slug}──▶ Icecast
```

It never calls Laravel. Icecast does: its url role asks
`/api/internal/icecast/auth` whether `slug` + broadcast token may publish, and
its event bindings report connect/disconnect.

## Layout

| Path | What |
|---|---|
| `internal/relay/relay.go` | the Icecast protocol: hello → PUT → `{"type":"ok"}` → copy |
| `internal/relay/harbor.go` | the container pass-through: router WebSocket ↔ studio WebSocket, plus pings |
| `internal/relay/wsframe.go`, `wslink.go` | the relay's own WebSocket: frames, handshakes, sockets that can be frozen at any byte |
| `internal/relay/session.go` | one studio connection: live, frozen for a hand-off, ending |
| `internal/relay/handoff.go` | moving live sessions to the other copy, sockets and all |
| `internal/relay/rollover.go` | when a copy moves to a new binary |
| `internal/relay/harbor_test.go` | tests against a fake router + harbor that copies the real one's behaviour |
| `internal/relay/metrics.go` | Prometheus counters for `/metrics` |
| `internal/relay/relay_test.go` | unit tests against a fake Icecast 2.5, plus a fuzz test of the hello parser |
| `cmd/relay/main.go` | the binary: flags, health server, SIGTERM drain |

## Build and test

Needs Go 1.27 (`go.mod`). The deploy builds it in a throwaway `golang`
container, so the server needs no Go.

```bash
go vet ./... && go test -race ./...
go test -fuzz FuzzParseHello -fuzztime 60s ./internal/relay/
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o gocast-relay ./cmd/relay
```

## Running

Two copies, `gocast-relay@8095` (health :18095) and `gocast-relay@8096`
(health :18096), behind nginx `least_conn`. A crash drops only that copy's
studios, which reconnect to the other within milliseconds.

- **A new binary is picked up by the copies themselves** (`internal/relay/rollover.go`).
  The deploy only renames it into place (`infra/native/relay-rollover.sh` watches).
  Each copy notices, and **one at a time** (a host-wide lock, and only
  while the other copy is up) it retires:
  - New studios get 503, and nginx (`proxy_next_upstream … http_503`) sends them to the other copy.
  - **Every live session is handed to the other copy, sockets and all** (`handoff.go`).
    Nobody notices: the studio, Icecast and harbor keep the same TCP connection,
    and the audio pauses for the hand-off itself (about a tenth of a millisecond per show).

  Then the copy exits and systemd starts the new binary, and the other copy does the same,
  back onto it. A whole rollover takes seconds. Rolling back is the same move: put the previous binary back.
- **When the other copy cannot take sessions** (a build from before hand-offs, a copy that is
  draining, a hand-off that fails), the copy retires the old way:
  - Free studios are handed over with 1001 and reconnect at once.
  - Container shows are left to end on their own, up to `RELAY_RETIRE_MAX`, 12 h by default.
- **Hand-offs, in short.** A session is frozen at whatever byte its sockets are on; the
  descriptors go to the other copy over an abstract unix socket (`@gocast-relay-handoff-<health addr>`,
  SCM_RIGHTS) with the relay's own state for them (bytes read but not parsed, bytes owed but not
  written, a fragmented message in progress, the ping and idle clocks). Two steps (ready, commit),
  so the sockets are never run by both copies or by neither. Only to the same uid and to the pid
  the other copy's `/healthz` named.
- **Before stepping aside, a copy test-runs the new binary** (`-help` must exit 0 within 5 s; every relay build does). If it fails, nothing changes:
  - The copy keeps serving on its own build.
  - `/healthz` shows `rollover_blocked`.
  - The deploy puts the previous binary back.
- **SIGTERM** (`systemctl restart/stop`) is the hard stop: every studio gets
  1001 at once. A live container show is heard as a ~5 s gap.
- **SIGUSR1** retires by hand under the same rules (hand-offs included): the other copy must be up
  and not retiring, and the lock must be free. Otherwise the copy logs `SIGUSR1 refused: …` and does nothing.
- **503 belongs to the relay.** It means "this copy is draining, try the other",
  and nginx counts it against the copy. A 503 from a station's router or harbor
  goes to the studio as 502 instead, or one busy station would mark both copies down for everyone.
- Per-host settings come from the environment as well as flags, because the unit is only rendered by
  `setup-native.sh` and an older binary would refuse an unknown flag:
  - `RELAY_HARBOR`: the router, `127.0.0.1:<ROUTER_PORT>`.
  - `RELAY_PEERS`: both health addresses.
  - `RELAY_RETIRE_MAX`.
- `-origins` must list the studio's hosts as bare hosts (e.g. `gocast.fm,www.gocast.fm`);
  without it every browser is refused, and a pattern with a scheme stops the
  binary at startup.
- `curl 127.0.0.1:18095/healthz` returns:
  `{"pid","active","icecast_active","harbor_active","draining","retiring","stale","build","rollover_blocked","handoff"}`.
  `handoff` is the hand-off version the copy takes sessions with (0: it does not).
  `/metrics` gives active, total, bytes and hand-offs in/out per `path` (`icecast`, `harbor`), plus closes by reason.

## Close codes the studio sees

A studio's reconnect does not wait for the 8 s: its broadcast-token request
carries the studio's own id, and when the source Icecast still carries is that
studio's (`RelaySourceHolder`), Laravel cuts it; the relay rides out the moment
Icecast takes to free the mount. Another device or tab cuts nothing and gets
4009.

| Code | Meaning | Studio |
|---|---|---|
| 4001 | Icecast/API refused the login (bad token, station off, not on relay) | final |
| 4002 | malformed hello | final |
| 4005 | Icecast ended the source mid-show (station turned off) | reconnect |
| 4009 | mount still has a source after 1 s of asking again, each ask given up to 3 s to answer (a just-cut source is waited out) | final on first go-live, retried on reconnect |
| 1001 | relay restarting | reconnect (lands on the other copy) |
| 1011 | Icecast unreachable | reconnect |
| 1008 | studio sent nothing for 8 s (under Icecast's 10 s `source-timeout`) | reconnect |

## Container pass-through

```
studio ──wss──▶ nginx /relay/broadcast/{slug} ─▶ relay ──ws──▶ router 127.0.0.1:8091/broadcast/{slug} ─▶ harbor
```

Turned on by `LIQUIDSOAP_INGEST_URL=wss://<stream host>/relay/broadcast/{slug}`
in api/.env; nothing in Laravel or the studio changes. Turned off (the way
back) by pointing it at `/broadcast/{slug}` again: new connections go straight
to the router, shows already on the relay carry on there.

**Why.** Harbor sends nothing to the studio during a show, so Cloudflare
closes the socket at 6010 s (100 min) and the studio reconnects. The relay
pings the studio every 30 s, which is what Cloudflare needs to see.

**What the relay does NOT do.** It reads nothing. The hello, the token check
(harbor asks Laravel), audio, `metadata` frames and every close code are
harbor's, so the studio's container mode sees the same thing it sees from
the router directly. There is no `{"type":"ok"}`, no idle timer (harbor's
own 10 s input timeout ends a silent show), and no busy retry (harbor drops
a second source on a held mount).

| Event | Studio sees | Measured on real harbor (2026-11-16) |
|---|---|---|
| station off / container gone | upgrade fails with the router's status (502) | same as direct |
| bad token | close 1011 "Authentication failed." | same as direct |
| second source on a held mount | TCP drop (1006), first show untouched | same as direct |
| studio silent 10 s | harbor drops it (1006) | same as direct |
| studio closes / vanishes | harbor is let go at once | mount free for the reconnect |
| relay copy rolls over (deploy) | nothing: the session moves to the other copy | one harbor connection throughout |
| relay copy restarted (SIGTERM) | 1001, harbor let go first | reconnect through the other copy in 3 ms, station stayed `live` |
| harbor stops reading for 10 s | 1011 "stream server stopped accepting audio" | (fake harbor only) |
| foreign Origin | 403, harbor never dialled | |

`-harbor` / `RELAY_HARBOR` defaults to `127.0.0.1:8091`; empty turns the
pass-through off (404).

Metrics:
- `relay_connections_active{path="harbor"}` and its siblings.
- `relay_closes_total{reason="harbor_*"}`, where the reasons are:
  - `harbor_client_closed`: the studio left.
  - `harbor_closed`: harbor ended it.
  - `harbor_write`: harbor stopped taking audio.
  - `harbor_studio_stalled`: the studio stopped reading.
  - `harbor_draining`: a restart handed it over.
  - `harbor_unreachable`, `harbor_refused_origin`, `harbor_too_big`, `harbor_bad_frame` (a protocol violation, answered 1002).

**Turning it on, in this order.** Each step is safe on its own, and the deploy
warns if the URL is switched before the other two:

1. Deploy a commit with this code. The first time, the relay copies are restarted the old way; no Pro show is on them yet.
2. Add the `/relay/broadcast/` location and `http_503` to the live `gocast-stream.conf` by hand (never re-run `setup-native.sh` on a certbot host), then `nginx -t && systemctl reload nginx`.
3. Set `LIQUIDSOAP_INGEST_URL=wss://<stream host>/relay/broadcast/{slug}` in `api/.env`, then run `php artisan config:cache`.
