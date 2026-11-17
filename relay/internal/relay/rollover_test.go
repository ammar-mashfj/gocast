package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// A Free studio and a container show on one copy, then Retire.
func TestRetireHandsOverFreeAndKeepsContainerShows(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.IdleTimeout = 10 * time.Second
	s, hs := startRelay(t, cfg)
	ctx := context.Background()

	free := dial(t, hs, nil)
	free.Write(ctx, websocket.MessageText, helloJSON("free-one", "t"))
	expectOK(t, free)
	pro := studio(t, hs, "pro-one")
	pro.Write(ctx, websocket.MessageText, helloJSON("pro-one", "t"))
	eventually(t, "pro at harbor", func() bool { return h.conn("pro-one") != nil })

	retired := make(chan struct{})
	go func() { s.retire(time.Minute); close(retired) }()

	// The Free studio is handed over at once, its source released first.
	if got := readUntilClose(t, free); got != CloseDraining {
		t.Fatalf("free studio close %d, want 1001", got)
	}
	select {
	case <-ice.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("free studio's icecast source not released")
	}
	eventually(t, "free counted as draining", func() bool { return s.Metrics.Closes("draining") == 1 })

	// New studios on either path are refused before the upgrade, so nginx
	// can send them to the other copy.
	for _, p := range []string{"/relay", "/relay/broadcast/pro-two"} {
		_, resp, err := dialPath(t, hs, p, nil)
		if err == nil || resp == nil || resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("%s while retiring: err=%v resp=%v, want 503", p, err, resp)
		}
	}
	if h.dials.Load() != 1 {
		t.Fatalf("harbor dialled %d times; the refused studio must not reach it", h.dials.Load())
	}

	// The container show keeps flowing, untouched, for as long as it lasts.
	for i := 0; i < 5; i++ {
		time.Sleep(100 * time.Millisecond)
		if err := pro.Write(ctx, websocket.MessageBinary, []byte(fmt.Sprintf("still-%d", i))); err != nil {
			t.Fatalf("container show broken by retire: %v", err)
		}
	}
	eventually(t, "audio still reaching harbor", func() bool {
		g := h.got("pro-one")
		return len(g) > 0 && string(g[len(g)-1].data) == "still-4"
	})
	select {
	case <-retired:
		t.Fatal("retired while a container show was still on")
	default:
	}
	if !s.Retiring() || s.ActiveOn(PathHarbor) != 1 || s.ActiveOn(PathIcecast) != 0 {
		t.Fatalf("retiring=%v harbor=%d icecast=%d", s.Retiring(), s.ActiveOn(PathHarbor), s.ActiveOn(PathIcecast))
	}

	// The show ends on its own: Retire returns, and nothing was kicked.
	pro.Close(websocket.StatusNormalClosure, "show over")
	select {
	case <-retired:
	case <-time.After(5 * time.Second):
		t.Fatal("Retire did not return after the last show ended")
	}
	if e := h.waitEnd(t); e.code != websocket.StatusNormalClosure {
		t.Fatalf("harbor saw %d, want the studio's own 1000", e.code)
	}
	if n := s.Metrics.Closes("harbor_draining"); n != 0 {
		t.Fatalf("a container show was kicked (%d)", n)
	}
}

func TestRetireHandsOverContainerShowsAfterMaxWait(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	ctx := context.Background()
	pro := studio(t, hs, "a")
	pro.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })

	start := time.Now()
	retired := make(chan struct{})
	go func() { s.retire(500 * time.Millisecond); close(retired) }()
	if got := readUntilClose(t, pro); got != CloseDraining {
		t.Fatalf("close %d, want 1001", got)
	}
	if d := time.Since(start); d < 400*time.Millisecond {
		t.Fatalf("handed over after %v, before the max wait", d)
	}
	<-retired
	eventually(t, "mount freed", func() bool { return h.conn("a") == nil })
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_draining") == 1 })
}

func TestRetireWithNothingOnReturnsAtOnce(t *testing.T) {
	s, _ := startRelay(t, harborConfig(newFakeHarbor(t).addr()))
	done := make(chan struct{})
	go func() { s.retire(time.Hour); close(done) }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Retire waited with nothing on")
	}
}

// exeBody is a stand-in binary named by build: a script that answers -help
// with exit 0, as every real relay build does. A build named "broken"
// fails, like a binary that cannot start.
func exeBody(build string) []byte {
	if build == "broken" {
		return []byte("#!/bin/sh\necho cannot start >&2\nexit 1\n")
	}
	return []byte("#!/bin/sh\n# " + build + "\nexit 0\n")
}

func writeExe(t *testing.T, dir, content string) string {
	t.Helper()
	p := filepath.Join(dir, "gocast-relay")
	if err := os.WriteFile(p, exeBody(content), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

// replaceExe installs new content the way the deploy does: a new file
// renamed over the old one.
func replaceExe(t *testing.T, path, content string) {
	t.Helper()
	tmp := path + ".new"
	if err := os.WriteFile(tmp, exeBody(content), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(tmp, path); err != nil {
		t.Fatal(err)
	}
	// The modification time is the cheap check; make sure it moves even on
	// a filesystem with coarse timestamps.
	later := time.Now().Add(2 * time.Second)
	os.Chtimes(path, later, later)
}

func TestStaleFollowsTheBinaryOnDisk(t *testing.T) {
	dir := t.TempDir()
	exe := writeExe(t, dir, "build-1")
	r, err := NewRollover(exe)
	if err != nil {
		t.Fatal(err)
	}
	if r.Stale() {
		t.Fatal("stale at start")
	}
	replaceExe(t, exe, "build-2")
	if !r.Stale() {
		t.Fatal("new binary on disk not noticed")
	}
	// A rollback: the running build is back on disk.
	replaceExe(t, exe, "build-1")
	if r.Stale() {
		t.Fatal("still stale after the running build was put back")
	}
	// Same bytes, new timestamp (a redeploy of an unchanged tree).
	replaceExe(t, exe, "build-1")
	if r.Stale() {
		t.Fatal("an identical binary counted as a change")
	}
	// Mid-rename the file is briefly missing: no decision is made on it.
	os.Remove(exe)
	if r.Stale() {
		t.Fatal("a missing binary counted as a change")
	}
}

func TestOnlyOneCopyHoldsTheRolloverLock(t *testing.T) {
	name := fmt.Sprintf("@gocast-relay-rollover-test-%d", time.Now().UnixNano())
	a := &Rollover{LockName: name}
	b := &Rollover{LockName: name}
	la, ok := a.TryLock()
	if !ok {
		t.Fatal("first lock refused")
	}
	if _, ok := b.TryLock(); ok {
		t.Fatal("second copy got the lock too")
	}
	la.Close()
	lb, ok := b.TryLock()
	if !ok {
		t.Fatal("lock not free after release")
	}
	lb.Close()
}

// fakePeer answers /healthz with whatever h holds.
func fakePeer(t *testing.T, h *atomic.Pointer[Health]) string {
	hs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v := h.Load()
		if v == nil {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		json.NewEncoder(w).Encode(v)
	}))
	t.Cleanup(hs.Close)
	return strings.TrimPrefix(hs.URL, "http://")
}

func TestPeerReady(t *testing.T) {
	var h atomic.Pointer[Health]
	addr := fakePeer(t, &h)
	r := &Rollover{Peers: []string{addr}}
	ctx := context.Background()

	h.Store(&Health{})
	if !r.anyPeerReady(ctx) {
		t.Fatal("a healthy peer is not ready")
	}
	h.Store(&Health{Draining: true})
	if r.anyPeerReady(ctx) {
		t.Fatal("a draining peer counted as ready")
	}
	h.Store(&Health{Draining: true, Retiring: true})
	if r.anyPeerReady(ctx) {
		t.Fatal("a retiring peer counted as ready")
	}
	h.Store(nil)
	if r.anyPeerReady(ctx) {
		t.Fatal("a peer answering 503 counted as ready")
	}
	if (&Rollover{Peers: []string{"127.0.0.1:1"}}).anyPeerReady(ctx) {
		t.Fatal("an unreachable peer counted as ready")
	}
	if (&Rollover{}).anyPeerReady(ctx) {
		t.Fatal("no peers counted as ready")
	}
}

func rolloverFor(t *testing.T, exe string, peers []string, lock string) *Rollover {
	t.Helper()
	r, err := NewRollover(exe)
	if err != nil {
		t.Fatal(err)
	}
	r.Peers = peers
	r.CheckEvery = 50 * time.Millisecond
	r.MaxWait = time.Minute
	r.LockName = lock
	return r
}

func TestRunRetiresOnlyWhenStaleAndThePeerCanTakeOver(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	var peer atomic.Pointer[Health]
	addr := fakePeer(t, &peer)
	exe := writeExe(t, t.TempDir(), "build-1")
	r := rolloverFor(t, exe, []string{addr}, fmt.Sprintf("@gocast-relay-test-%d", time.Now().UnixNano()))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pro := studio(t, hs, "a")
	pro.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })

	done := make(chan bool, 1)
	go func() { done <- r.Run(ctx, s, t.Logf) }()

	// Not stale: nothing happens.
	peer.Store(&Health{})
	time.Sleep(200 * time.Millisecond)
	if s.Draining() {
		t.Fatal("retired with an unchanged binary")
	}
	// Stale, but the peer is down: still nothing, or new studios would have
	// nowhere to go.
	peer.Store(nil)
	replaceExe(t, exe, "build-2")
	time.Sleep(300 * time.Millisecond)
	if s.Draining() {
		t.Fatal("retired with no peer to take over")
	}
	// The peer comes back: retire, keeping the show.
	peer.Store(&Health{})
	eventually(t, "retiring", s.Retiring)
	if err := pro.Write(ctx, websocket.MessageBinary, []byte("on air")); err != nil {
		t.Fatalf("show cut: %v", err)
	}
	select {
	case <-done:
		t.Fatal("Run returned while the show was on")
	case <-time.After(200 * time.Millisecond):
	}
	pro.Close(websocket.StatusNormalClosure, "")
	select {
	case ok := <-done:
		if !ok {
			t.Fatal("Run returned false")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after the show ended")
	}
}

func TestTwoStaleCopiesRetireOneAtATime(t *testing.T) {
	// Two copies, both with a new binary waiting, each the other's peer.
	// Each serves its own /healthz from its real state.
	lock := fmt.Sprintf("@gocast-relay-test-%d", time.Now().UnixNano())
	type copyT struct {
		s    *Server
		hs   *httptest.Server
		r    *Rollover
		addr string
	}
	h := newFakeHarbor(t)
	mk := func() *copyT {
		s, hs := startRelay(t, harborConfig(h.addr()))
		exe := writeExe(t, t.TempDir(), "build-1")
		r := rolloverFor(t, exe, nil, lock)
		health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			json.NewEncoder(w).Encode(Health{Draining: s.Draining(), Retiring: s.Retiring(), Stale: r.Stale()})
		}))
		t.Cleanup(health.Close)
		return &copyT{s: s, hs: hs, r: r, addr: strings.TrimPrefix(health.URL, "http://")}
	}
	a, b := mk(), mk()
	a.r.Peers, b.r.Peers = []string{b.addr}, []string{a.addr}

	ctx := context.Background()
	// A container show on each copy keeps both from finishing quickly.
	sa := studio(t, a.hs, "on-a")
	sa.Write(ctx, websocket.MessageText, helloJSON("on-a", "t"))
	sb := studio(t, b.hs, "on-b")
	sb.Write(ctx, websocket.MessageText, helloJSON("on-b", "t"))
	eventually(t, "both on harbor", func() bool { return h.conn("on-a") != nil && h.conn("on-b") != nil })

	replaceExe(t, a.r.ExePath, "build-2")
	replaceExe(t, b.r.ExePath, "build-2")
	rctx, cancel := context.WithCancel(ctx)
	defer cancel()
	doneA, doneB := make(chan bool, 1), make(chan bool, 1)
	go func() { doneA <- a.r.Run(rctx, a.s, t.Logf) }()
	go func() { doneB <- b.r.Run(rctx, b.s, t.Logf) }()

	eventually(t, "one copy retiring", func() bool { return a.s.Retiring() || b.s.Retiring() })
	// Never both at once: one copy must stay open to new studios.
	for i := 0; i < 20; i++ {
		if a.s.Draining() && b.s.Draining() {
			t.Fatal("both copies retiring at once")
		}
		time.Sleep(25 * time.Millisecond)
	}
	first, second := a, b
	firstSt, firstDone := sa, doneA
	if b.s.Retiring() {
		first, second = b, a
		firstSt, firstDone = sb, doneB
	}
	if second.s.Draining() {
		t.Fatal("second copy draining while the first retires")
	}
	// A new studio still gets in, on the copy that is not retiring.
	c := studio(t, second.hs, "new-one")
	c.CloseNow()

	// The first copy's show ends and it finishes retiring. Its process would
	// now exit; until it does, it still holds the lock, so the second copy
	// must not start retiring in the meantime (it would refuse new studios
	// while the first is not back yet).
	firstSt.Close(websocket.StatusNormalClosure, "")
	select {
	case <-firstDone:
	case <-time.After(5 * time.Second):
		t.Fatal("first copy never finished retiring")
	}
	time.Sleep(300 * time.Millisecond)
	if second.s.Draining() {
		t.Fatal("second copy retired while the first still held the lock")
	}
	_ = first
}

func TestValidateOriginPatterns(t *testing.T) {
	if err := ValidateOriginPatterns([]string{"gocast.fm", "www.gocast.fm", "*.gocast.fm", "localhost:3000"}); err != nil {
		t.Fatalf("bare hosts refused: %v", err)
	}
	for _, bad := range []string{"https://gocast.fm", "gocast.fm/x", "[gocast"} {
		if err := ValidateOriginPatterns([]string{bad}); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

// The studio stops reading while harbor sends it data: the relay gives up on
// the studio, and says so instead of "the studio left".
func TestStudioThatStopsReadingIsLabelledStalled(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.PingInterval = 0
	s, hs := startRelay(t, cfg)
	c := studio(t, hs, "a")
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	// The test studio never reads; harbor floods it until buffers fill.
	go func() {
		big := bytes.Repeat([]byte{1}, 60<<10)
		for i := 0; i < 2000; i++ {
			conn := h.conn("a")
			if conn == nil || conn.Write(ctx, websocket.MessageBinary, big) != nil {
				return
			}
		}
	}()
	eventually(t, "stalled studio labelled", func() bool { return s.Metrics.Closes("harbor_studio_stalled") == 1 })
	if n := s.Metrics.Closes("harbor_client_closed"); n != 0 {
		t.Fatalf("also counted as the studio leaving (%d)", n)
	}
	c.CloseNow()
}

// A drain that starts while harbor is being dialled refuses the upgrade (503,
// so nginx retries the other copy) instead of accepting and closing.
func TestDrainDuringTheDialRefusesTheUpgrade(t *testing.T) {
	h := newFakeHarbor(t)
	gate := make(chan struct{})
	var arrived atomic.Int64
	inner := h.hs.Config.Handler
	h.hs.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		arrived.Add(1)
		<-gate
		inner.ServeHTTP(w, r)
	})
	s, hs := startRelay(t, harborConfig(h.addr()))
	type result struct {
		resp *http.Response
		err  error
	}
	res := make(chan result, 1)
	go func() {
		_, resp, err := dialPath(t, hs, "/relay/broadcast/a", nil)
		res <- result{resp, err}
	}()
	eventually(t, "dial under way", func() bool { return arrived.Load() == 1 })
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	go s.Drain(ctx)
	eventually(t, "draining", s.Draining)
	close(gate)
	r := <-res
	if r.err == nil || r.resp == nil || r.resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("err=%v resp=%v, want 503", r.err, r.resp)
	}
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_draining") == 1 })
	e := h.waitEnd(t)
	if e.code != -1 {
		t.Fatalf("harbor saw %+v, want the relay's dial dropped", e)
	}
}

// Review round 2.

// #1: a 503 from one station's router must not reach nginx as 503, which
// would mark both relay copies down for everyone.
func TestRouter503GoesOutAs502(t *testing.T) {
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "busy", http.StatusServiceUnavailable)
	}))
	t.Cleanup(router.Close)
	s, hs := startRelay(t, harborConfig(strings.TrimPrefix(router.URL, "http://")))
	_, resp, err := dialPath(t, hs, "/relay/broadcast/a", nil)
	if err == nil || resp == nil || resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("err=%v resp=%v, want 502", err, resp)
	}
	if s.Metrics.Closes("harbor_unreachable") != 1 {
		t.Fatal("not counted")
	}
}

// #2: the lock lives as long as the Rollover, through any garbage collection.
func TestRolloverLockSurvivesGC(t *testing.T) {
	name := fmt.Sprintf("@gocast-relay-gc-test-%d", time.Now().UnixNano())
	var peer atomic.Pointer[Health]
	peer.Store(&Health{})
	s, _ := startRelay(t, harborConfig(newFakeHarbor(t).addr()))
	r := rolloverFor(t, writeExe(t, t.TempDir(), "build-1"), []string{fakePeer(t, &peer)}, name)
	if why, ok := r.Begin(context.Background(), s, false); !ok {
		t.Fatalf("Begin refused: %s", why)
	}
	for i := 0; i < 5; i++ {
		runtime.GC()
		time.Sleep(10 * time.Millisecond)
	}
	if l, ok := (&Rollover{LockName: name}).TryLock(); ok {
		l.Close()
		t.Fatal("lock released by the garbage collector while retiring")
	}
	runtime.KeepAlive(r)
}

// #3: a manual retire goes through the same lock: refused while the other
// copy holds it, so the two never drain at once.
func TestManualRetireRespectsTheLock(t *testing.T) {
	name := fmt.Sprintf("@gocast-relay-manual-test-%d", time.Now().UnixNano())
	var peer atomic.Pointer[Health]
	peer.Store(&Health{})
	other, ok := (&Rollover{LockName: name}).TryLock()
	if !ok {
		t.Fatal("could not take the lock")
	}
	defer other.Close()
	s, _ := startRelay(t, harborConfig(newFakeHarbor(t).addr()))
	r := rolloverFor(t, writeExe(t, t.TempDir(), "build-1"), []string{fakePeer(t, &peer)}, name)
	why, ok := r.Begin(context.Background(), s, false)
	if ok || why != "the other copy is retiring" {
		t.Fatalf("manual retire while the other copy retires: ok=%v why=%q", ok, why)
	}
	if s.Draining() {
		t.Fatal("drained anyway")
	}
	// And with the peer down it refuses too.
	other.Close()
	peer.Store(nil)
	if why, ok := r.Begin(context.Background(), s, false); ok || why != "no other copy ready to take new studios" {
		t.Fatalf("peer down: ok=%v why=%q", ok, why)
	}
	// Once allowed, a second Begin (a second SIGUSR1) is refused.
	peer.Store(&Health{})
	if why, ok := r.Begin(context.Background(), s, false); !ok {
		t.Fatalf("refused: %s", why)
	}
	if why, ok := r.Begin(context.Background(), s, false); ok || why != "already retiring" {
		t.Fatalf("second Begin: ok=%v why=%q", ok, why)
	}
}

// #3: two Retire calls at once run one retirement.
func TestRetireTwiceRunsOnce(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := harborConfig(newFakeHarbor(t).addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.IdleTimeout = 10 * time.Second
	s, hs := startRelay(t, cfg)
	free := dial(t, hs, nil)
	free.Write(context.Background(), websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, free)
	go readUntilClose(t, free) // a real studio reads, so its close handshake completes
	done := make(chan struct{}, 2)
	go func() { s.retire(time.Minute); done <- struct{}{} }()
	go func() { s.retire(time.Minute); done <- struct{}{} }()
	for i := 0; i < 2; i++ {
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("a Retire call never returned")
		}
	}
	if n := s.Metrics.Closes("draining"); n != 1 {
		t.Fatalf("free studio handed over %d times", n)
	}
}

// #4: a binary that cannot start is never stepped aside for: the copy keeps
// serving on its own build and says why in /healthz.
func TestBrokenBinaryBlocksTheRollover(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	var peer atomic.Pointer[Health]
	peer.Store(&Health{})
	exe := writeExe(t, t.TempDir(), "build-1")
	r := rolloverFor(t, exe, []string{fakePeer(t, &peer)}, fmt.Sprintf("@gocast-relay-broken-%d", time.Now().UnixNano()))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go r.Run(ctx, s, t.Logf)

	replaceExe(t, exe, "broken")
	eventually(t, "blocked", func() bool { return strings.HasPrefix(r.Blocked(), "new binary failed its test run") })
	time.Sleep(300 * time.Millisecond)
	if s.Draining() {
		t.Fatal("stepped aside for a binary that cannot start")
	}
	c := studio(t, hs, "a") // still taking studios
	c.CloseNow()

	// The previous binary goes back (the deploy's rollback): nothing to do.
	replaceExe(t, exe, "build-1")
	if r.Blocked() != "" || r.Stale() {
		t.Fatalf("after rollback: blocked=%q stale=%v", r.Blocked(), r.Stale())
	}
	// A good new build later is taken.
	replaceExe(t, exe, "build-2")
	eventually(t, "retiring on a good build", s.Retiring)
}

// #6: studios are handed over with s.mu free, so /healthz and the peer's
// readiness check never wait on a close.
func TestKicksRunOutsideTheLock(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "connected", func() bool { return h.conn("a") != nil })
	var lockFree atomic.Bool
	s.mu.Lock()
	for _, st := range s.conns {
		orig := st.release
		st.release = func() {
			if s.mu.TryLock() {
				lockFree.Store(true)
				s.mu.Unlock()
			}
			orig()
		}
	}
	s.mu.Unlock()
	expired, cancel := context.WithTimeout(context.Background(), 0)
	defer cancel()
	s.Drain(expired)
	if !lockFree.Load() {
		t.Fatal("release ran with s.mu held")
	}
}
