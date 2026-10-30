# relay

The Free-plan ingest: a browser studio's WebSocket audio, written to Icecast
byte for byte. No container, no decoding, no re-encoding. Pro stations never
touch it. Why and how it fits: `docs/RELAY-SERVICE-PLAN.md`.

```
studio ──wss (webcast)──▶ nginx (relay.gocast.fm) ─▶ relay@1 :8095 / relay@2 :8096 ──PUT /stream/{slug}──▶ Icecast
```

It never calls Laravel. Icecast does: its url role asks
`/api/internal/icecast/auth` whether `slug` + broadcast token may publish, and
its event bindings report connect/disconnect.

## Layout

| Path | What |
|---|---|
| `internal/relay/relay.go` | the whole protocol: hello → PUT → `{"type":"ok"}` → copy |
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

| Code | Meaning | Studio |
|---|---|---|
| 4001 | Icecast/API refused the login (bad token, station off, not on relay) | final |
| 4002 | malformed hello | final |
| 4005 | Icecast ended the source mid-show (station turned off) | reconnect |
| 4009 | mount already has a source | final on first go-live, retried on reconnect |
| 1001 | relay restarting | reconnect (lands on the other copy) |
| 1011 | Icecast unreachable | reconnect |
| 1008 | studio sent nothing for 15 s | reconnect |
