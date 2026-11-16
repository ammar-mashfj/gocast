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

Two copies, `gocast-relay@1` (:8095, health :8195) and `gocast-relay@2`
(:8096, health :8196), behind nginx `least_conn`. A crash or a restart drops
only that copy's studios, which reconnect to the other within milliseconds.

- **Deploy = restart one, wait, restart the other.** SIGTERM closes every
  studio with 1001 so it reconnects at once; never restart both together.
- `-origins` must list the studio's hosts (e.g. `gocast.fm,www.gocast.fm`);
  without it every browser is refused.
- `curl 127.0.0.1:8195/healthz` → `{"active":N,"draining":false,"pid":…}`;
  `/metrics` → active, total, bytes, closes by reason.

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
| relay copy restarted | 1001, harbor let go first | reconnect through the other copy in 3 ms, station stayed `live` |
| harbor stops reading for 10 s | 1011 "stream server stopped accepting audio" | (fake harbor only) |
| foreign Origin | 403, harbor never dialled | |

`-harbor` defaults to `127.0.0.1:8091` (the router's port) so the systemd
unit carries no new flag; `-harbor ''` turns the pass-through off (404).
Metrics: `relay_closes_total{reason="harbor_*"}`.
