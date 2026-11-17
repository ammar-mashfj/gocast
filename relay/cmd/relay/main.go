// Command relay serves the studio WebSocket endpoints (see package relay):
// /relay for Free studios (→ Icecast) and /relay/broadcast/{slug} for
// container studios (→ the station router → harbor, see harbor.go).
//
// Two copies run behind nginx.
//
// A NEW BINARY is picked up by the copies themselves (relay.Rollover): a
// deploy renames it into place, each copy notices, and one at a time they
// retire — new studios go to the other copy, and every live session is
// handed to the other copy, sockets and all, without its studio noticing
// (relay/internal/relay/handoff.go) — then exit; systemd starts the new
// binary. When the other copy cannot take sessions, Free studios are told to
// reconnect and container shows are left to end. SIGUSR1 asks for the same
// retirement by hand.
//
// SIGTERM (systemctl stop/restart) is the hard stop: every studio is closed
// with 1001 at once and reconnects through the other copy. Free listeners
// ride that out on Icecast's /standby; a container show is heard as a gap.
//
// (A socket-handover reload via cloudflare/tableflip was tried first and
// dropped: it can't start a second reload until the previous old process has
// exited, which with live shows can take hours, and systemd loses track of
// the handed-over process.)
//
// Settings that differ per host come from the environment as well as from
// flags (RELAY_HARBOR, RELAY_PEERS, RELAY_RETIRE_MAX): the systemd unit is
// only rendered by setup-native.sh, and a deploy that rolls back to an older
// binary must never start it with a flag that binary does not know. An
// unknown environment variable is simply ignored.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"gocast.fm/relay/internal/relay"
)

func envOr(name, def string) string {
	if v, ok := os.LookupEnv(name); ok {
		return v
	}
	return def
}

func main() {
	cfg := relay.DefaultConfig()
	listen := flag.String("listen", "127.0.0.1:8095", "WebSocket listen address (nginx proxies relay.gocast.fm here)")
	health := flag.String("health", "127.0.0.1:8195", "health/metrics listen address (keep on loopback)")
	pidFile := flag.String("pid-file", "", "write the pid here once both ports are bound (test harnesses only; systemd needs none)")
	origins := flag.String("origins", "", "comma-separated allowed Origin hosts")
	flag.StringVar(&cfg.IcecastAddr, "icecast", cfg.IcecastAddr, "Icecast host:port")
	flag.StringVar(&cfg.MountPrefix, "mount-prefix", cfg.MountPrefix, "Icecast mount prefix")
	flag.DurationVar(&cfg.IdleTimeout, "idle-timeout", cfg.IdleTimeout, "close a studio that sends nothing for this long")
	flag.StringVar(&cfg.HarborAddr, "harbor", envOr("RELAY_HARBOR", "127.0.0.1:8091"),
		"station router host:port for the container pass-through at /relay/broadcast/{slug}; empty = off (env RELAY_HARBOR)")
	peers := flag.String("peers", envOr("RELAY_PEERS", "127.0.0.1:18095,127.0.0.1:18096"),
		"health addresses of every relay copy on this host, this one included; empty = never retire by itself (env RELAY_PEERS)")
	retireMax := flag.Duration("retire-max", 12*time.Hour, "longest a retiring copy waits for container shows to end (env RELAY_RETIRE_MAX)")
	flag.Parse()
	if v := os.Getenv("RELAY_RETIRE_MAX"); v != "" && !flagSet("retire-max") {
		d, err := time.ParseDuration(v)
		if err != nil {
			log.Fatalf("RELAY_RETIRE_MAX %q: %v", v, err)
		}
		*retireMax = d
	}
	if cfg.HarborAddr != "" {
		if err := relay.HarborAddrOK(cfg.HarborAddr); err != nil {
			log.Fatalf("-harbor %q: %v", cfg.HarborAddr, err)
		}
	}
	host, _, err := net.SplitHostPort(cfg.IcecastAddr)
	if err != nil {
		log.Fatalf("-icecast %q: %v", cfg.IcecastAddr, err)
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]" // an IPv6 literal, as a Host header writes it
	}
	cfg.IcecastHost = host
	if *origins != "" {
		cfg.OriginPatterns = strings.Split(*origins, ",")
	}
	if err := relay.ValidateOriginPatterns(cfg.OriginPatterns); err != nil {
		log.Fatalf("-origins: %v", err)
	}
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	srv := relay.New(cfg)

	exe, err := os.Executable()
	if err != nil {
		log.Fatalf("own binary: %v", err)
	}
	roll, err := relay.NewRolloverForSelf(exe)
	if err != nil {
		log.Fatalf("own binary %s: %v", exe, err)
	}
	roll.MaxWait = *retireMax
	roll.SelfPID = os.Getpid()
	for _, p := range strings.Split(*peers, ",") {
		if p = strings.TrimSpace(p); p != "" && p != *health {
			roll.Peers = append(roll.Peers, p)
		}
	}

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatal(err)
	}
	hln, err := net.Listen("tcp", *health)
	if err != nil {
		log.Fatal(err)
	}
	// Only once both ports are ours: a copy that fails to start (port taken)
	// must not overwrite the running copy's pid file.
	if *pidFile != "" {
		os.WriteFile(*pidFile, []byte(itoa(os.Getpid())+"\n"), 0o644)
	}

	// Sessions handed over by the other copy when it retires. Without this
	// listener the other copy retires the old way (it reads "handoff" in our
	// /healthz).
	if hl, err := srv.ListenHandoff(relay.HandoffSocket(*health)); err != nil {
		log.Printf("hand-off socket %s: %v (this copy will not take sessions from the other)", relay.HandoffSocket(*health), err)
	} else {
		defer hl.Close()
	}

	web := &http.Server{Handler: srv, ReadHeaderTimeout: 10 * time.Second}
	go web.Serve(ln)

	hmux := http.NewServeMux()
	hmux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Only what the listener is doing now: a copy that stopped taking
		// hand-offs must not be counted on for one.
		handoff := 0
		if srv.TakesHandoffs() {
			handoff = relay.HandoffVersion
		}
		json.NewEncoder(w).Encode(relay.Health{
			PID:             os.Getpid(),
			Active:          srv.Active(),
			IcecastActive:   srv.ActiveOn(relay.PathIcecast),
			HarborActive:    srv.ActiveOn(relay.PathHarbor),
			Draining:        srv.Draining(),
			Retiring:        srv.Retiring(),
			HandingOff:      srv.HandingOff(),
			Stale:           roll.Stale(),
			Build:           roll.Build(),
			RolloverBlocked: roll.BlockedSoFar(),
			Handoff:         handoff,
			Harbor:          cfg.HarborAddr,
		})
	})
	hmux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) { srv.Metrics.Render(w) })
	hsrv := &http.Server{Handler: hmux, ReadHeaderTimeout: 5 * time.Second}
	go hsrv.Serve(hln)

	log.Printf("relay pid %d build %s on %s → icecast %s, harbor %q, peers %v",
		os.Getpid(), roll.Build(), *listen, cfg.IcecastAddr, cfg.HarborAddr, roll.Peers)

	ctx, stopRoll := context.WithCancel(context.Background())
	retired := make(chan struct{})
	var retiredOnce sync.Once
	markRetired := func() { retiredOnce.Do(func() { close(retired) }) }
	if len(roll.Peers) > 0 {
		go func() {
			if roll.Run(ctx, srv, log.Printf) {
				markRetired()
			}
		}()
	}

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGTERM, syscall.SIGINT, syscall.SIGUSR1)
	for {
		select {
		case <-retired:
			web.Close()
			hsrv.Close()
			log.Printf("pid %d exiting after retiring", os.Getpid())
			// The rollover lock is released by the exit itself, never earlier.
			runtime.KeepAlive(roll.Held())
			return
		case s := <-sigs:
			if s == syscall.SIGUSR1 {
				// By hand: the same retirement as a new binary triggers,
				// under the same rules (the other copy up, the lock), but
				// without needing a changed binary. Off this loop: Begin
				// asks the other copy and may test-run a binary (seconds),
				// and a SIGTERM meanwhile must reach the drain at once, or
				// systemd's stop window runs out and kills the studios
				// without a 1001.
				go func() {
					why, ok := roll.Begin(ctx, srv, false)
					if !ok {
						log.Printf("SIGUSR1 refused: %s", why)
						return
					}
					if ctx.Err() != nil {
						return // a SIGTERM came meanwhile: the drain has it
					}
					if t := roll.Target(); t != nil {
						log.Printf("SIGUSR1: handing %d session(s) to the other copy (pid %d), then exiting", srv.Active(), t.PID)
					} else {
						log.Printf("SIGUSR1: the other copy cannot take sessions; retiring (%d Free studio(s) told to reconnect, %d container show(s) left to end)",
							srv.ActiveOn(relay.PathIcecast), srv.ActiveOn(relay.PathHarbor))
					}
					srv.RetireVia(*retireMax, roll.Target())
					markRetired()
				}()
				continue
			}
			stopRoll()
			log.Printf("%s: closing %d connection(s) with 1001", s, srv.Active())
			web.Close() // stop accepting; hijacked WebSockets are closed by Drain below
			expired, cancel := context.WithTimeout(context.Background(), 0)
			srv.Drain(expired)
			cancel()
			hsrv.Close()
			log.Printf("pid %d exiting", os.Getpid())
			return
		}
	}
}

func flagSet(name string) bool {
	set := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == name {
			set = true
		}
	})
	return set
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
