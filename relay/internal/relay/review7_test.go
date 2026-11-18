package relay

// Review round 7.

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// #1: the other copy missing one step (busy for longer than handoffStep)
// does not end the hand-off: the sender dials again and moves the rest,
// the session that timed out included.
func TestHandoffSurvivesOneStalledStep(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	cfg.HandoffWindow = 20 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	var ended []chan error
	for i := 0; i < 3; i++ {
		slug := fmt.Sprintf("s-%d", i)
		c := studio(t, hsA, slug)
		t.Cleanup(func() { c.CloseNow() })
		_, e := watchStudio(c)
		ended = append(ended, e)
		c.Write(context.Background(), websocket.MessageText, helloJSON(slug, "t"))
		eventually(t, slug+" at harbor", func() bool { return h.conn(slug) != nil })
	}
	var calls atomic.Int32
	testHookBeforeReady = func() {
		if calls.Add(1) == 1 {
			time.Sleep(handoffStep + 500*time.Millisecond) // the sender gives up on this step
		}
	}
	defer func() { testHookBeforeReady = nil }()
	start := time.Now()
	moved := a.handOff(toB, -1)
	if moved != 3 || a.Active() != 0 {
		t.Fatalf("moved %d: a=%d after %s", moved, a.Active(), time.Since(start))
	}
	// The stalled attempt's copy on b is let go once its late "ready"
	// finds the connection gone.
	eventually(t, "b holds the three", func() bool { return b.Active() == 3 })
	for i, e := range ended {
		noEnd(t, e, fmt.Sprintf("s-%d", i))
	}
}

// #1: a refusal that cannot change (another hand-off version) is not
// retried for the whole window.
func TestHandoffRefusalIsFinal(t *testing.T) {
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: fmt.Sprintf("@gocast-relay-refuse-%d", time.Now().UnixNano()), Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			uc, err := ln.AcceptUnix()
			if err != nil {
				return
			}
			readHmsg(uc)
			writeHmsg(uc, hmsg{T: "refuse", Why: "hand-off version 99"}, nil)
			uc.Close()
		}
	}()
	cfg := harborConfig(newFakeHarbor(t).addr())
	cfg.HandoffWindow = 10 * time.Second
	a, _ := quietRelay(t, cfg)
	start := time.Now()
	a.handOff(HandoffTarget{Socket: ln.Addr().String(), PID: os.Getpid()}, -1)
	if d := time.Since(start); d > time.Second {
		t.Fatalf("retried a final refusal for %s", d)
	}
}

// #4: an empty close frame (1005) is passed on as an empty close frame, not
// as a dropped connection (1006 at the far end).
func TestEmptyCloseIsPassedOnAsAClose(t *testing.T) {
	// Harbor's empty close, towards the studio.
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()
	studioSide := newWSConn(a, false, 1<<20, time.Second, nil)
	got := make(chan []byte, 1)
	go func() {
		peer := newWSConn(b, true, 1<<20, time.Second, nil)
		f, err := peer.readFrame()
		if err != nil || f.op != opClose {
			got <- []byte("not a close")
			return
		}
		got <- append([]byte{}, f.payload...)
	}()
	forwardClose(studioSide, StatusNoStatusRcvd, "")
	if p := <-got; len(p) != 0 {
		t.Fatalf("close payload %q, want empty", p)
	}

	// The studio's empty close, towards harbor: harbor sees 1005, not a drop.
	h := newFakeHarbor(t)
	_, hs := quietRelay(t, harborConfig(h.addr()))
	c := rawStudio(t, strings.TrimPrefix(hs.URL, "http://"), "/relay/broadcast/a")
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	c.nc.Write(appendFrame(nil, true, opClose, nil, true))
	if e := h.waitEnd(t); e.code != websocket.StatusNoStatusRcvd {
		t.Fatalf("harbor saw %d, want 1005", e.code)
	}
}

// #7: a drain that catches a Free studio logging in to Icecast has told it
// 1001 by the time the drain returns (the process exits right after).
func TestDrainDuringLoginTellsTheStudioFirst(t *testing.T) {
	slow, err := net.Listen("tcp", "127.0.0.1:0") // an Icecast that never answers
	if err != nil {
		t.Fatal(err)
	}
	defer slow.Close()
	go func() {
		for {
			c, err := slow.Accept()
			if err != nil {
				return
			}
			defer c.Close()
		}
	}()
	cfg := testConfig(slow.Addr().String())
	cfg.IcecastTimeout = 10 * time.Second
	s, hs := quietRelay(t, cfg)
	c := dial(t, hs, nil)
	defer c.CloseNow()
	c.Write(context.Background(), websocket.MessageText, helloJSON("f", "t"))
	ss := liveSession(t, s)
	// The moment the login is cut short, the session can finish and the
	// drain return: the 1001 must already be out by then.
	toldFirst := make(chan bool, 1)
	hook := func(e *session) {
		if e == ss {
			toldFirst <- ss.studio.closeSent.Load()
		}
	}
	testHookCancel.Store(&hook)
	defer testHookCancel.Store(nil)
	time.Sleep(300 * time.Millisecond) // logging in
	expired, cancel := context.WithTimeout(context.Background(), 0)
	defer cancel()
	start := time.Now()
	s.Drain(expired)
	if d := time.Since(start); d > closeWait {
		t.Fatalf("the drain waited %s for the login", d)
	}
	if !<-toldFirst {
		t.Fatal("the login was cut short before the studio was told 1001")
	}
	if got := readUntilClose(t, c); got != CloseDraining {
		t.Fatalf("studio got %d, want 1001", got)
	}
}

// #8: a session holding its own lock (its "ok" stuck on a dead link) is
// skipped, not waited on: the live ones move at once.
func TestHandoffSkipsABusySession(t *testing.T) {
	h := newFakeHarbor(t)
	ice := newFakeIcecast(t, ok200)
	cfg := harborConfig(h.addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.HelloTimeout = 10 * time.Second
	cfg.HandoffWindow = 3 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	busy := dial(t, hsA, nil) // a Free studio in setup
	defer busy.CloseNow()
	eventually(t, "tracked", func() bool { return a.Active() == 1 })
	bss := liveSession(t, a)
	bss.mu.Lock()
	for i := 0; i < 4; i++ {
		slug := fmt.Sprintf("p-%d", i)
		c := studio(t, hsA, slug)
		t.Cleanup(func() { c.CloseNow() })
		c.Write(context.Background(), websocket.MessageText, helloJSON(slug, "t"))
		eventually(t, slug+" at harbor", func() bool { return h.conn(slug) != nil })
	}
	done := make(chan struct{})
	go func() { a.handOffAll(toB); close(done) }()
	start := time.Now()
	eventually(t, "the live ones moved", func() bool { return b.Active() == 4 })
	d := time.Since(start)
	bss.mu.Unlock()
	<-done
	if d > time.Second {
		t.Fatalf("took %s with one session busy", d)
	}
}

// #3: the test run passes this copy's own flags plus -check; an older
// binary that does not know -check is asked -help instead.
func TestTestRunUsesTheRealSettings(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) string {
		p := filepath.Join(dir, name)
		os.WriteFile(p, []byte("#!/bin/sh\n"+body), 0o755)
		return p
	}
	args := []string{"-origins", "gocast.fm"}
	// Gets exactly the flags, then -check.
	seen := filepath.Join(dir, "seen")
	ok := write("ok", `echo "$@" > `+seen+"\nexit 0\n")
	if err := testRun(ok, args); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(seen); strings.TrimSpace(string(b)) != "-origins gocast.fm -check" {
		t.Fatalf("ran with %q", b)
	}
	// Refuses the settings: blocked.
	bad := write("bad", "echo '-harbor \"x\": not host:port' >&2\nexit 1\n")
	if err := testRun(bad, args); err == nil {
		t.Fatal("a binary refusing the settings passed")
	}
	// An older build: no -check, but -help works.
	old := write("old", `for a; do [ "$a" = -check ] && { echo "flag provided but not defined: -check" >&2; exit 2; }; done
[ "$1" = -help ] && exit 0
exit 3
`)
	if err := testRun(old, args); err != nil {
		t.Fatalf("an older build failed: %v", err)
	}
	// No settings known (tests): -help.
	if err := testRun(old, nil); err != nil {
		t.Fatal(err)
	}
}

// Found on staging: a hand-off socket name taken at start (something left
// over holding it) is tried again until it frees, and the copy then takes
// sessions without a restart.
func TestHandoffSocketTakenAtStartIsRetried(t *testing.T) {
	old := handoffRelisten
	handoffRelisten = 200 * time.Millisecond
	defer func() { handoffRelisten = old }()
	name := fmt.Sprintf("@gocast-relay-handoff-taken-%d-%d", os.Getpid(), time.Now().UnixNano())
	holder, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	b.KeepListeningHandoff(ctx, name)
	if st := b.State(); st.HandoffSocket != "" {
		t.Fatalf("claims hand-offs on a name it could not take: %q", st.HandoffSocket)
	}
	holder.Close()
	eventually(t, "listening again", func() bool { return b.State().HandoffSocket == name })

	c := studio(t, hsA, "s")
	defer c.CloseNow()
	_, ended := watchStudio(c)
	c.Write(context.Background(), websocket.MessageText, helloJSON("s", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("s") != nil })
	if moved := a.handOff(HandoffTarget{Socket: name, PID: os.Getpid()}, -1); moved != 1 || b.Active() != 1 {
		t.Fatalf("moved %d, b=%d", moved, b.Active())
	}
	noEnd(t, ended, "s")

	// Ended with the copy: the name is given back.
	cancel()
	eventually(t, "closed", func() bool { return b.State().HandoffSocket == "" })
}
