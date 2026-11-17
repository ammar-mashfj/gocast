package relay

// Review round 5.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// #1: the peer list spells the other copy's address one way (localhost),
// the other copy its own health flag another (127.0.0.1). The hand-off
// still lands: the socket dialled is the one the other copy reports.
func TestHandoffDialsTheSocketThePeerReports(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b) // named after nothing the peer list says
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		st := b.State()
		json.NewEncoder(w).Encode(Health{PID: os.Getpid(), Handoff: HandoffVersion, HandoffSocket: st.HandoffSocket})
	}))
	t.Cleanup(health.Close)
	port := health.URL[strings.LastIndex(health.URL, ":")+1:]
	r := rolloverFor(t, writeExe(t, t.TempDir(), "build-1"), []string{"localhost:" + port}, fmt.Sprintf("@gocast-relay-spell-%d", time.Now().UnixNano()))

	c := studio(t, hsA, "a")
	defer c.CloseNow()
	_, ended := watchStudio(c)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	if why, ok := r.Begin(context.Background(), a, false); !ok {
		t.Fatalf("Begin: %s", why)
	}
	if tgt := r.Target(); tgt == nil || tgt.Socket != toB.Socket {
		t.Fatalf("target %+v, want the socket b reported (%s)", tgt, toB.Socket)
	}
	done := make(chan struct{})
	go func() { a.RetireVia(time.Minute, r.Target()); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("retired the old way instead of handing off")
	}
	if b.Active() != 1 || a.Metrics.handedOutTotal(PathHarbor) != 1 {
		t.Fatalf("not handed off: b=%d", b.Active())
	}
	noEnd(t, ended, "a")
}

// #3: a write started outside the readers (a ping) is waited for by a
// freeze: its bytes end up in the snapshot, not after it.
func TestFreezeWaitsForAWriteInFlight(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.PingInterval = 0
	a, hsA := quietRelay(t, cfg)
	c := studio(t, hsA, "a")
	defer c.CloseNow()
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	ss := liveSession(t, a)

	ss.mu.Lock()
	ss.writers++ // a ping that passed its "live" check and is about to write
	ss.mu.Unlock()
	frozen := make(chan bool, 1)
	go func() { frozen <- ss.freeze(2 * time.Second) }()
	select {
	case <-frozen:
		t.Fatal("froze with a write still on its way")
	case <-time.After(200 * time.Millisecond):
	}
	ping := appendFrame(nil, true, opPing, pingPayload, false)
	ss.studio.write(ping) // the session is frozen by now: it is kept owed
	ss.writeDone()
	if !<-frozen {
		t.Fatal("freeze failed")
	}
	snap := ss.snapshot()
	if !bytes.Contains(snap.Studio.Pending, ping) {
		t.Fatalf("the ping is not in the snapshot (owed %d bytes)", len(snap.Studio.Pending))
	}
	ss.unfreeze()
}

// Cleanup: /healthz's numbers come from one read.
func TestStateIsOneConsistentRead(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.IdleTimeout = 5 * time.Second
	s, hs := quietRelay(t, cfg)
	free := dial(t, hs, nil)
	defer free.CloseNow()
	free.Write(context.Background(), websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, free)
	pro := studio(t, hs, "p")
	defer pro.CloseNow()
	eventually(t, "both", func() bool { return s.Active() == 2 })
	st := s.State()
	if st.Active != 2 || st.Icecast != 1 || st.Harbor != 1 || st.Active != st.Icecast+st.Harbor || st.HandoffSocket != "" {
		t.Fatalf("%+v", st)
	}
}

// A peer that has just started is not stepped aside for until it has been
// up for PeerSettle: nginx may still have it marked down from its restart.
func TestJustStartedPeerIsNotReadyYet(t *testing.T) {
	var h atomic.Pointer[Health]
	addr := fakePeer(t, &h)
	r := &Rollover{Peers: []string{addr}, PeerSettle: 5 * time.Second}
	h.Store(&Health{PID: 7, Handoff: HandoffVersion, HandoffSocket: "@x", UpMillis: 1500})
	if r.readyPeerOK(context.Background()) {
		t.Fatal("a copy up for 1.5 s counted as ready")
	}
	h.Store(&Health{PID: 7, Handoff: HandoffVersion, HandoffSocket: "@x", UpMillis: 6000})
	if !r.readyPeerOK(context.Background()) {
		t.Fatal("a settled copy not ready")
	}
	// A build from before hand-offs reports no up_ms: taken as before.
	h.Store(&Health{PID: 7})
	if !r.readyPeerOK(context.Background()) {
		t.Fatal("an older peer is never ready")
	}
	if d := (&Rollover{}).PeerSettle; d != 0 {
		t.Fatal("zero value")
	}
	r2, _ := NewRollover(writeExe(t, t.TempDir(), "b"))
	if r2.PeerSettle <= 2*time.Second {
		t.Fatalf("default settle %s is not over nginx's 2 s fail_timeout", r2.PeerSettle)
	}
}
