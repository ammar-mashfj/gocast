package relay

// Review round 4.

import (
	"bytes"
	"context"
	"net"
	"os"
	"path/filepath"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// #1: the build is the program running, not the file at its path now. A
// binary replaced between the start and the hash makes the copy stale at
// once, never "on the new build".
func TestBuildIsTheRunningProgram(t *testing.T) {
	dir := t.TempDir()
	running := filepath.Join(dir, "running")
	os.WriteFile(running, exeBody("build-1"), 0o755)
	exe := writeExe(t, dir, "build-2") // what the deploy has put at the path since
	r, err := newRollover(exe, running)
	if err != nil {
		t.Fatal(err)
	}
	want, _, _ := hashFile(running)
	if r.Build() != want[:12] {
		t.Fatalf("build %s, want the running program's %s", r.Build(), want[:12])
	}
	if !r.Stale() {
		t.Fatal("not stale although the file at the path is another build")
	}
	// /proc/self/exe is what the relay itself uses.
	self, err := NewRolloverForSelf(exe)
	if err != nil {
		t.Fatal(err)
	}
	testBin, _, _ := hashFile("/proc/self/exe")
	if self.Build() != testBin[:12] || !self.Stale() {
		t.Fatalf("for self: build %s (want %s), stale %v", self.Build(), testBin[:12], self.Stale())
	}
}

// flakyAcceptor fails `fails` times, then hands out real connections.
type flakyAcceptor struct {
	ln    *net.UnixListener
	fails atomic.Int32
}

func (f *flakyAcceptor) AcceptUnix() (*net.UnixConn, error) {
	if f.fails.Add(-1) >= 0 {
		return nil, &net.OpError{Op: "accept", Err: os.NewSyscallError("accept4", syscall.EMFILE)}
	}
	return f.ln.AcceptUnix()
}

// #3: accept errors do not end the hand-off listener.
func TestHandoffListenerSurvivesAcceptErrors(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	name := "@gocast-relay-flaky-" + time.Now().Format("150405.000000000")
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	fa := &flakyAcceptor{ln: ln}
	fa.fails.Store(5)
	b.handoffUp.Store(true)
	go b.acceptHandoffs(fa)

	c := studio(t, hsA, "a")
	defer c.CloseNow()
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	a.handOffAll(HandoffTarget{Socket: name, PID: os.Getpid()})
	if b.Active() != 1 || !b.TakesHandoffs() {
		t.Fatalf("after 5 accept errors: b has %d sessions, takes hand-offs %v", b.Active(), b.TakesHandoffs())
	}
	ln.Close()
	eventually(t, "listener closed: no longer advertised", func() bool { return !b.TakesHandoffs() })
}

// #4: a past write deadline that is not the freeze's own (a freeze and its
// thaw both came while the write was in the kernel) does not count as a
// stall: the write carries on.
func TestPastDeadlineWithoutAFreezeIsNotAStall(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
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
	l := newLink(nc, 10*time.Second)
	data := bytes.Repeat([]byte("y"), 20<<20)
	wrote := make(chan error, 1)
	go func() { wrote <- l.write(data) }()
	time.Sleep(300 * time.Millisecond)
	nc.SetWriteDeadline(pastDeadline) // the freeze's deadline, its flag already cleared
	time.Sleep(100 * time.Millisecond)
	close(release)
	if err := <-wrote; err != nil {
		t.Fatalf("write: %v (taken for a stall)", err)
	}
	nc.Close()
	if n := <-got; n != len(data) {
		t.Fatalf("peer got %d of %d", n, len(data))
	}
}

// #5: a peer address that is this very process is not "the other copy".
func TestSelfIsNeverThePeer(t *testing.T) {
	var h atomic.Pointer[Health]
	addr := fakePeer(t, &h)
	h.Store(&Health{PID: 42, Handoff: HandoffVersion})
	r := &Rollover{Peers: []string{addr}, SelfPID: 42}
	if r.anyPeerReady(context.Background()) {
		t.Fatal("took itself for the other copy")
	}
	r.SelfPID = 43
	if !r.anyPeerReady(context.Background()) {
		t.Fatal("the real other copy not ready")
	}
}

// #8: a session holding its own lock (a Free studio's slow "ok") does not
// stall the server while a retirement looks for sessions to hand off.
func TestHandoffLoopDoesNotHoldTheServerLock(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.HelloTimeout = 5 * time.Second
	cfg.HandoffWindow = 2 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	c := dial(t, hsA, nil) // in setup: never says hello
	defer c.CloseNow()
	eventually(t, "tracked", func() bool { return a.Active() == 1 })
	ss := liveSession(t, a)
	ss.mu.Lock() // as runIcecast does while its "ok" goes out
	done := make(chan struct{})
	go func() { a.handOffAll(toB); close(done) }()
	time.Sleep(100 * time.Millisecond)
	start := time.Now()
	n := a.Active() // takes s.mu
	if d := time.Since(start); d > 50*time.Millisecond {
		t.Fatalf("Active took %s: the server lock was held", d)
	}
	ss.mu.Unlock()
	<-done
	_ = n
}

// Cleanup: a retirement waiting for its last container show returns the
// moment it ends, not on the next poll.
func TestRetireReturnsWhenTheLastShowEnds(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := quietRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	done := make(chan time.Time, 1)
	go func() { s.retire(time.Hour); done <- time.Now() }()
	eventually(t, "retiring", s.Retiring)
	c.Close(websocket.StatusNormalClosure, "")
	var ended time.Time
	eventually(t, "the show gone", func() bool {
		if s.Active() == 0 {
			ended = time.Now()
			return true
		}
		return false
	})
	select {
	case at := <-done:
		if d := at.Sub(ended); d > 100*time.Millisecond {
			t.Fatalf("retire returned %s after the last show left", d)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("retire never returned")
	}
}

// Cleanup: Free studios have their own write timeout.
func TestFreeStudioWriteTimeoutIsItsOwn(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.StudioWriteTimeout = 1234 * time.Millisecond
	cfg.HarborWriteTimeout = 9 * time.Second
	a, hsA := quietRelay(t, cfg)
	c := dial(t, hsA, nil)
	defer c.CloseNow()
	c.Write(context.Background(), websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, c)
	if got := liveSession(t, a).studio.timeout; got != cfg.StudioWriteTimeout {
		t.Fatalf("Free studio write timeout %s", got)
	}
	if d := DefaultConfig().StudioWriteTimeout; d <= 0 {
		t.Fatal("no default")
	}
}
