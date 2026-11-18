package relay

// Review round 6.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// freeShowGoesQuiet starts a Free show, sends one audio frame and stops:
// the studio is quiet from here on, as a studio is while its socket is
// frozen.
func freeShowGoesQuiet(t *testing.T, hs *httptest.Server, ice *fakeIcecast) (*websocket.Conn, chan error) {
	t.Helper()
	c := dial(t, hs, nil)
	t.Cleanup(func() { c.CloseNow() })
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, c)
	_, ended := watchStudio(c)
	c.Write(ctx, websocket.MessageBinary, []byte("audio"))
	eventually(t, "audio at Icecast", func() bool { return len(ice.received()) > 0 })
	return c, ended
}

// #3: time frozen is not silence. A hand-off called off after a freeze
// longer than the idle limit leaves the show its idle time as it stood when
// the freeze began.
func TestFrozenTimeIsNotSilence(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = time.Second
	a, hsA := quietRelay(t, cfg)
	c, ended := freeShowGoesQuiet(t, hsA, ice)
	ss := liveSession(t, a)
	if !ss.freeze(time.Second) {
		t.Fatal("freeze")
	}
	time.Sleep(2 * cfg.IdleTimeout)
	ss.unfreeze()
	time.Sleep(300 * time.Millisecond) // well inside what was left of the idle time
	c.Write(context.Background(), websocket.MessageBinary, []byte("more audio"))
	noEnd(t, ended, "f")
	if n := a.Metrics.Closes("idle"); n != 0 {
		t.Fatalf("closed as idle %d time(s)", n)
	}
	// The clock still runs: a studio really quiet for the idle limit goes.
	select {
	case <-ended:
	case <-time.After(3 * cfg.IdleTimeout):
		t.Fatal("a quiet studio was never closed")
	}
}

// #3, across the hand-off: the copy that takes the show starts its idle
// clock from the silence before the freeze, not from the sender's clock.
func TestHandedOffShowKeepsItsIdleTime(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	c, ended := freeShowGoesQuiet(t, hsA, ice)
	testHookSnapshot = func(*sessionSnap) { time.Sleep(2 * cfg.IdleTimeout) } // a slow hand-off
	defer func() { testHookSnapshot = nil }()
	a.handOffAll(toB)
	if b.Active() != 1 {
		t.Fatal("not handed off")
	}
	time.Sleep(300 * time.Millisecond)
	c.Write(context.Background(), websocket.MessageBinary, []byte("more audio"))
	noEnd(t, ended, "f")
	if n := b.Metrics.Closes("idle"); n != 0 {
		t.Fatalf("closed as idle on the new copy %d time(s)", n)
	}
}

// #2: a restarted peer waits out the settle time even when its hand-off
// listener failed (it reports up_ms but no hand-offs).
func TestSettleHoldsForAPeerWithoutHandoffs(t *testing.T) {
	var h atomic.Pointer[Health]
	addr := fakePeer(t, &h)
	r := &Rollover{Peers: []string{addr}, PeerSettle: 5 * time.Second}
	h.Store(&Health{PID: 7, UpMillis: 1500}) // handoff 0: its listener failed
	if r.readyPeerOK(context.Background()) {
		t.Fatal("a copy up for 1.5 s counted as ready")
	}
	h.Store(&Health{PID: 7, UpMillis: 6000})
	if tgt, ok := r.readyPeer(context.Background()); !ok || tgt != nil {
		t.Fatalf("settled, no hand-offs: %v %v", tgt, ok)
	}
}

// balancePair is two copies, a with a rollover that sees b as its peer.
type balancePair struct {
	a, b       *Server
	hsA        *httptest.Server
	r          *Rollover
	peerBuild  atomic.Value // string: the build b reports
	lock       string
	harborDial func(slug string)
}

func newBalancePair(t *testing.T) *balancePair {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	p := &balancePair{}
	p.a, p.hsA = quietRelay(t, cfg)
	p.b, _ = quietRelay(t, cfg)
	listenHandoff(t, p.b)
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		st := p.b.State()
		json.NewEncoder(w).Encode(Health{PID: os.Getpid(), Active: st.Active, Handoff: HandoffVersion,
			HandoffSocket: st.HandoffSocket, Build: p.peerBuild.Load().(string), UpMillis: 60000})
	}))
	t.Cleanup(health.Close)
	p.lock = fmt.Sprintf("@gocast-relay-balance-%d", time.Now().UnixNano())
	p.r = rolloverFor(t, writeExe(t, t.TempDir(), "build-1"), []string{strings.TrimPrefix(health.URL, "http://")}, p.lock)
	p.peerBuild.Store(p.r.Build())
	p.harborDial = func(slug string) {
		c := studio(t, p.hsA, slug)
		t.Cleanup(func() { c.CloseNow() })
		c.Write(context.Background(), websocket.MessageText, helloJSON(slug, "t"))
		eventually(t, slug+" at harbor", func() bool { return h.conn(slug) != nil })
	}
	return p
}

// #6: SIGUSR2's Balance hands half the difference to the other copy.
func TestBalanceEvensTheCopiesOut(t *testing.T) {
	p := newBalancePair(t)
	for i := 0; i < 7; i++ {
		p.harborDial(fmt.Sprintf("s-%d", i))
	}
	eventually(t, "all live", func() bool { return p.a.ActiveOn(PathHarbor) == 7 })
	moved, why := p.r.Balance(context.Background(), p.a, 5*time.Second)
	if why != "" || moved != 3 || p.a.Active() != 4 || p.b.Active() != 3 {
		t.Fatalf("moved %d (%q): a=%d b=%d", moved, why, p.a.Active(), p.b.Active())
	}
	// Even now: a second ask moves nothing.
	if moved, why := p.r.Balance(context.Background(), p.a, 5*time.Second); moved != 0 || !strings.HasPrefix(why, "already even") {
		t.Fatalf("second balance: %d %q", moved, why)
	}
	// The rollover lock was given back: a retirement can still take it.
	if ln, ok := p.r.TryLock(); !ok {
		t.Fatal("lock still held after the balance")
	} else {
		ln.Close()
	}
}

// #6: never while the other copy retires (it holds the lock), never onto a
// copy on another build (it would hand them all back), never from a copy
// whose own binary changed.
func TestBalanceRefuses(t *testing.T) {
	p := newBalancePair(t)
	for i := 0; i < 4; i++ {
		p.harborDial(fmt.Sprintf("s-%d", i))
	}
	eventually(t, "all live", func() bool { return p.a.ActiveOn(PathHarbor) == 4 })
	ctx := context.Background()

	other := &Rollover{LockName: p.lock} // the other copy, retiring
	held, ok := other.TryLock()
	if !ok {
		t.Fatal("lock")
	}
	if moved, why := p.r.Balance(ctx, p.a, time.Second); moved != 0 || why != "the other copy is retiring" {
		t.Fatalf("with the lock taken: %d %q", moved, why)
	}
	held.Close()

	p.peerBuild.Store("someotherbld")
	if moved, why := p.r.Balance(ctx, p.a, time.Second); moved != 0 || why != "the other copy is not on this build" {
		t.Fatalf("other build: %d %q", moved, why)
	}
	p.peerBuild.Store(p.r.Build())

	replaceExe(t, p.r.ExePath, "build-2")
	if moved, why := p.r.Balance(ctx, p.a, time.Second); moved != 0 || !strings.HasPrefix(why, "the binary on disk changed") {
		t.Fatalf("stale: %d %q", moved, why)
	}
	if p.a.Active() != 4 {
		t.Fatalf("sessions moved anyway: a=%d", p.a.Active())
	}
}

// #7, #8: the relay's own answers say they are the relay's, and a refused
// container upgrade is counted on the container path.
func TestRelayAnswersAreMarked(t *testing.T) {
	get := func(hs *httptest.Server) *http.Response {
		resp, err := http.Get(hs.URL + "/relay/broadcast/deploy-route-check")
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		return resp
	}
	off, hsOff := quietRelay(t, harborConfig(""))
	if r := get(hsOff); r.StatusCode != http.StatusNotFound || r.Header.Get(RelayHeader) != "1" {
		t.Fatalf("pass-through off: %d, header %q", r.StatusCode, r.Header.Get(RelayHeader))
	}
	_ = off
	h := newFakeHarbor(t)
	on, hsOn := quietRelay(t, harborConfig(h.addr()))
	if r := get(hsOn); r.StatusCode != http.StatusUpgradeRequired || r.Header.Get(RelayHeader) != "1" {
		t.Fatalf("pass-through on: %d, header %q", r.StatusCode, r.Header.Get(RelayHeader))
	}
	if on.Metrics.Closes("harbor_refused_upgrade") != 1 || on.Metrics.Closes("refused_upgrade") != 0 {
		t.Fatal("not counted on the container path")
	}
}
