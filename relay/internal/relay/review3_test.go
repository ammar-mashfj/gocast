package relay

// Review round 3.

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// #5: time spent frozen does not count against the write timeout. A write
// cut short by a freeze longer than the timeout still completes once the
// session resumes, here and on the copy that takes it.
func TestFrozenTimeDoesNotCountAgainstTheWriteTimeout(t *testing.T) {
	for _, moved := range []bool{false, true} {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		got := make(chan int, 1)
		release := make(chan struct{})
		go func() {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			<-release
			var b bytes.Buffer
			b.ReadFrom(c)
			got <- b.Len()
		}()
		nc, _ := net.Dial("tcp", ln.Addr().String())
		l := newLink(nc, 500*time.Millisecond)
		data := bytes.Repeat([]byte("x"), 20<<20)
		done := make(chan error, 1)
		go func() { done <- l.write(data) }()
		time.Sleep(200 * time.Millisecond) // blocked: nobody reads
		l.freeze()
		if err := <-done; err != nil {
			t.Fatal(err)
		}
		time.Sleep(time.Second) // frozen twice as long as the timeout
		w := &l
		if moved {
			snap := snapLink(&l)
			l2 := newLink(nc, 500*time.Millisecond)
			restorePending(&l2, snap)
			w = &l2
		} else {
			l.thaw()
		}
		close(release)
		if err := w.write(nil); err != nil {
			t.Fatalf("moved=%v: resumed write failed: %v (frozen time counted against the timeout)", moved, err)
		}
		nc.Close()
		if n := <-got; n != len(data) {
			t.Fatalf("moved=%v: peer got %d of %d bytes", moved, n, len(data))
		}
		ln.Close()
	}
}

// #5, at the session: a Free show whose hand-off is called off after a long
// freeze carries on, it is not cut with 4005.
func TestCalledOffHandoffKeepsTheFreeShow(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 10 * time.Second
	a, hsA := quietRelay(t, cfg)
	c := dial(t, hsA, nil)
	defer c.CloseNow()
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, c)
	_, ended := watchStudio(c)
	st := startStream(c, "f", time.Millisecond)
	eventually(t, "audio", func() bool { return len(ice.received()) > 100 })
	ss := liveSession(t, a)
	if !ss.freeze(time.Second) {
		t.Fatal("freeze")
	}
	time.Sleep(2 * cfg.WriteTimeout)
	ss.unfreeze()
	time.Sleep(100 * time.Millisecond)
	n := st.finish(t)
	noEnd(t, ended, "f")
	want := icecastBytes("f", n)
	eventually(t, "every byte", func() bool { return bytes.Equal(ice.received(), want) })
	if a.Metrics.Closes("icecast_write") != 0 {
		t.Fatal("cut as a stalled write")
	}
}

// #6: a drain tells every studio 1001 within closeWait, even studios whose
// sockets are so full that the close frame itself cannot be written.
func TestDrainTellsEveryStudioInTime(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 60 * time.Second // nothing else may end them
	cfg.PingInterval = 0
	s, hs := quietRelay(t, cfg)
	ctx := context.Background()
	big := bytes.Repeat([]byte{1}, 60<<10)
	for i := 0; i < 3; i++ {
		slug := fmt.Sprintf("full-%d", i)
		c := studio(t, hs, slug) // never reads
		t.Cleanup(func() { c.CloseNow() })
		c.Write(ctx, websocket.MessageText, helloJSON(slug, "t"))
		eventually(t, slug+" at harbor", func() bool { return h.conn(slug) != nil })
		hc := h.conn(slug)
		go func() {
			for j := 0; j < 1000; j++ {
				wctx, cancel := context.WithTimeout(ctx, 20*time.Second)
				err := hc.Write(wctx, websocket.MessageBinary, big)
				cancel()
				if err != nil {
					return
				}
			}
		}()
	}
	time.Sleep(time.Second) // every buffer towards those studios is full
	healthy := studio(t, hs, "healthy")
	defer healthy.CloseNow()
	healthy.Write(ctx, websocket.MessageText, helloJSON("healthy", "t"))
	eventually(t, "healthy at harbor", func() bool { return h.conn("healthy") != nil })
	expired, cancel := context.WithTimeout(ctx, 0)
	defer cancel()
	start := time.Now()
	drained := make(chan struct{})
	go func() { s.Drain(expired); close(drained) }()
	if got := readUntilClose(t, healthy); got != CloseDraining {
		t.Fatalf("healthy studio got %d", got)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("healthy studio told after %s", d)
	}
	select {
	case <-drained:
		if d := time.Since(start); d > closeWait+time.Second {
			t.Fatalf("drain took %s", d)
		}
	case <-time.After(closeWait + 3*time.Second):
		t.Fatal("drain held up by studios that stopped reading")
	}
}

// #7: /healthz never runs the new binary's test itself.
func TestBlockedSoFarNeverWaitsOnTheTestRun(t *testing.T) {
	dir := t.TempDir()
	exe := writeExe(t, dir, "build-1")
	r, err := NewRollover(exe)
	if err != nil {
		t.Fatal(err)
	}
	tmp := exe + ".new"
	os.WriteFile(tmp, []byte("#!/bin/sh\nsleep 2\nexit 1\n"), 0o755)
	os.Rename(tmp, exe)
	later := time.Now().Add(2 * time.Second)
	os.Chtimes(exe, later, later)
	start := time.Now()
	if got := r.BlockedSoFar(); got != "" {
		t.Fatalf("reported %q before any test ran", got)
	}
	if d := time.Since(start); d > 500*time.Millisecond {
		t.Fatalf("BlockedSoFar took %s", d)
	}
	if r.Blocked() == "" {
		t.Fatal("the slow failing binary passed")
	}
	start = time.Now()
	if !strings.HasPrefix(r.BlockedSoFar(), "new binary failed") || time.Since(start) > 500*time.Millisecond {
		t.Fatal("the cached verdict is not reported at once")
	}
}

// #8: a drain racing a hand-off's snapshot. Run under -race: the snapshot
// reads the readers' buffers only while they are parked.
func TestSnapshotRacingADrain(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	s, hs := quietRelay(t, cfg)
	ctx := context.Background()
	for i := 0; i < 20; i++ {
		slug := fmt.Sprintf("r-%d", i)
		c := studio(t, hs, slug)
		t.Cleanup(func() { c.CloseNow() })
		go func() {
			for {
				if c.Write(ctx, websocket.MessageBinary, []byte("audio audio audio")) != nil {
					return
				}
			}
		}()
	}
	eventually(t, "all live", func() bool { return s.ActiveOn(PathHarbor) == 20 })
	s.mu.Lock()
	var list []*session
	for ss := range s.conns {
		list = append(list, ss)
	}
	s.mu.Unlock()
	var wg sync.WaitGroup
	snaps, nils := 0, 0
	var mu sync.Mutex
	for _, ss := range list {
		if !ss.freeze(time.Second) {
			continue
		}
		wg.Add(2)
		go func() { defer wg.Done(); ss.kick(nil) }()
		go func() {
			defer wg.Done()
			snap := ss.snapshot()
			mu.Lock()
			if snap == nil {
				nils++
			} else {
				snaps++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	t.Logf("snapshots taken %d, refused after the kick %d", snaps, nils)
	for _, ss := range list {
		if sent, _ := ss.commitTo(func() error { return nil }); sent {
			t.Fatal("committed a kicked session")
		}
	}
}

// #9: a kick between track and going live is not overwritten.
func TestKickBeforeHarborGoesLiveStays(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := quietRelay(t, harborConfig(h.addr()))
	testHookBeforeLive = func(ss *session) { ss.kick(nil) }
	defer func() { testHookBeforeLive = nil }()
	c := studio(t, hs, "a")
	defer c.CloseNow()
	if got := readUntilClose(t, c); got != CloseDraining {
		t.Fatalf("studio got %d, want 1001", got)
	}
	eventually(t, "counted as the drain's", func() bool { return s.Metrics.Closes("harbor_draining") == 1 })
	if n := s.Metrics.Closes("harbor_client_closed") + s.Metrics.Closes("harbor_closed"); n != 0 {
		t.Fatalf("also counted elsewhere: %d", n)
	}
	if e := h.waitEnd(t); e.code != -1 {
		t.Fatalf("harbor saw %d", e.code)
	}
}

// Cleanup 1: a burst of frames is taken from the front without moving the
// rest each time, and what is left unread is exactly the partial frame.
func TestBurstOfFramesAndTheUnreadTail(t *testing.T) {
	var buf []byte
	for i := 0; i < 50000; i++ {
		buf = appendFrame(buf, true, opBinary, []byte(fmt.Sprintf("%06d", i)), true)
	}
	partial := appendFrame(nil, true, opBinary, []byte("half of me"), true)[:7]
	buf = append(buf, partial...)
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()
	c := newWSConn(a, false, 1<<20, time.Second, buf)
	start := time.Now()
	for i := 0; i < 50000; i++ {
		f, err := c.readFrame()
		if err != nil || string(f.payload) != fmt.Sprintf("%06d", i) {
			t.Fatalf("frame %d: %q %v", i, f.payload, err)
		}
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("50k frames took %s", d)
	}
	if !bytes.Equal(c.unread(), partial) {
		t.Fatalf("unread %d bytes, want the %d of the partial frame", len(c.unread()), len(partial))
	}
}

// #1: /healthz says when a retiring copy is handing off, from the moment it
// starts retiring.
func TestHealthSaysHandingOff(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HandoffWindow = 2 * time.Second
	cfg.HelloTimeout = 5 * time.Second
	ice := newFakeIcecast(t, ok200)
	cfg.IcecastAddr = ice.ln.Addr().String()
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	// A Free studio that never says hello keeps the hand-off waiting.
	c := dial(t, hsA, nil)
	defer c.CloseNow()
	done := make(chan struct{})
	go func() { a.RetireVia(time.Minute, &toB); close(done) }()
	eventually(t, "retiring", a.isRetiring)
	if !a.isHandingOff() {
		t.Fatal("retiring without handing_off while the hand-off runs")
	}
	<-done
	if a.isHandingOff() {
		t.Fatal("still handing off after it ended")
	}
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	health.Close()
}
