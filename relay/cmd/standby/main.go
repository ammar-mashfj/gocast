// Command standby feeds Icecast's /standby mount with paced silence; see
// package standby. One instance per server (gocast-standby.service).
//
// The source password comes from the ICECAST_SOURCE_PASSWORD environment
// variable, never a flag, so it does not show in `ps`.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gocast.fm/relay/internal/standby"
)

func main() {
	file := flag.String("file", "silence.mp3", "MP3 to loop (44.1 kHz stereo 128k, like the studio)")
	cfg := standby.Config{}
	flag.StringVar(&cfg.IcecastAddr, "icecast", "127.0.0.1:8000", "Icecast host:port")
	flag.StringVar(&cfg.Mount, "mount", "/standby", "mount to publish")
	flag.StringVar(&cfg.User, "user", "source", "source user")
	flag.DurationVar(&cfg.Lead, "lead", time.Second, "how far ahead of real time to run")
	flag.Parse()
	log.SetFlags(0)

	cfg.Password = os.Getenv("ICECAST_SOURCE_PASSWORD")
	if cfg.Password == "" {
		log.Fatal("ICECAST_SOURCE_PASSWORD is not set")
	}
	b, err := os.ReadFile(*file)
	if err != nil {
		log.Fatal(err)
	}
	frames, err := standby.Frames(b)
	if err != nil {
		log.Fatalf("%s: %v", *file, err)
	}
	log.Printf("looping %s (%d frames)", *file, len(frames))

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	standby.Run(ctx, cfg, frames)
}
