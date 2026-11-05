// Command relay serves the studio WebSocket endpoint (see package relay).
//
// Two copies run behind nginx. A deploy restarts them one at a time: on
// SIGTERM a copy stops accepting, closes every studio with 1001 so it
// reconnects at once (nginx sends it to the other copy), and exits. Listeners
// ride the moment out on Icecast's /standby fallback; in the relay lab drills the
// studio was back in ~25 ms and no listener heard a gap.
//
// (A socket-handover reload via cloudflare/tableflip was tried first and
// dropped: it can't start a second reload until the previous old process has
// exited, which with live shows can take hours, and systemd loses track of
// the handed-over process.)
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
	"strings"
	"syscall"
	"time"

	"gocast.fm/relay/internal/relay"
)

func main() {
	cfg := relay.DefaultConfig()
	listen := flag.String("listen", "127.0.0.1:8095", "WebSocket listen address (nginx proxies relay.gocast.fm here)")
	health := flag.String("health", "127.0.0.1:8195", "health/metrics listen address (keep on loopback)")
	pidFile := flag.String("pid-file", "", "write the pid here once both ports are bound (test harnesses only; systemd needs none)")
	origins := flag.String("origins", "", "comma-separated allowed Origin hosts")
	flag.StringVar(&cfg.IcecastAddr, "icecast", cfg.IcecastAddr, "Icecast host:port")
	flag.StringVar(&cfg.MountPrefix, "mount-prefix", cfg.MountPrefix, "Icecast mount prefix")
	flag.DurationVar(&cfg.IdleTimeout, "idle-timeout", cfg.IdleTimeout, "close a studio that sends nothing for this long")
	flag.Parse()
	cfg.IcecastHost = strings.Split(cfg.IcecastAddr, ":")[0]
	if *origins != "" {
		cfg.OriginPatterns = strings.Split(*origins, ",")
	}
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	srv := relay.New(cfg)

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

	web := &http.Server{Handler: srv, ReadHeaderTimeout: 10 * time.Second}
	go web.Serve(ln)

	hmux := http.NewServeMux()
	hmux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"pid": os.Getpid(), "active": srv.Active(), "draining": srv.Draining()})
	})
	hmux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) { srv.Metrics.Render(w) })
	hsrv := &http.Server{Handler: hmux, ReadHeaderTimeout: 5 * time.Second}
	go hsrv.Serve(hln)

	log.Printf("relay pid %d on %s → icecast %s", os.Getpid(), *listen, cfg.IcecastAddr)

	term := make(chan os.Signal, 1)
	signal.Notify(term, syscall.SIGTERM, syscall.SIGINT)
	s := <-term

	log.Printf("%s: closing %d connection(s) with 1001", s, srv.Active())
	web.Close() // stop accepting; hijacked WebSockets are closed by Drain below
	expired, cancel := context.WithTimeout(context.Background(), 0)
	srv.Drain(expired)
	cancel()
	hsrv.Close()
	log.Printf("pid %d exiting", os.Getpid())
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
