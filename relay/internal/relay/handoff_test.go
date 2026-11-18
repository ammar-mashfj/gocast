package relay

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

var handoffSeq atomic.Int64

// listenHandoff gives s a hand-off socket of its own and returns it as a
// target. Everything runs in this one process, so the pid is ours.
func listenHandoff(t *testing.T, s *Server) HandoffTarget {
	t.Helper()
	name := fmt.Sprintf("@gocast-relay-handoff-test-%d-%d-%d", os.Getpid(), time.Now().UnixNano(), handoffSeq.Add(1))
	ln, err := s.ListenHandoff(name)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	return HandoffTarget{Socket: name, PID: os.Getpid()}
}

func quietRelay(t *testing.T, cfg Config) (*Server, *httptest.Server) {
	s, hs := startRelay(t, cfg)
	s.Logf = t.Logf
	return s, hs
}

// streamer writes numbered binary frames until stopped.
type streamer struct {
	c      *websocket.Conn
	prefix string
	sent   atomic.Int64
	stop   chan struct{}
	done   chan error
}

func frameN(prefix string, i int64) []byte { return []byte(fmt.Sprintf("%s:%06d|", prefix, i)) }

func startStream(c *websocket.Conn, prefix string, every time.Duration) *streamer {
	st := &streamer{c: c, prefix: prefix, stop: make(chan struct{}), done: make(chan error, 1)}
	go func() {
		ctx := context.Background()
		for i := int64(0); ; i++ {
			select {
			case <-st.stop:
				st.done <- nil
				return
			default:
			}
			if err := c.Write(ctx, websocket.MessageBinary, frameN(prefix, i)); err != nil {
				st.done <- err
				return
			}
			st.sent.Add(1)
			if every > 0 {
				time.Sleep(every)
			}
		}
	}()
	return st
}

func (st *streamer) finish(t *testing.T) int64 {
	t.Helper()
	close(st.stop)
	if err := <-st.done; err != nil {
		t.Fatalf("%s: studio write failed: %v", st.prefix, err)
	}
	return st.sent.Load()
}

// watchStudio reads the studio's socket (answering pings) and reports the
// first thing that ends it.
func watchStudio(c *websocket.Conn) (msgs chan string, ended chan error) {
	msgs, ended = make(chan string, 64), make(chan error, 1)
	go func() {
		for {
			_, m, err := c.Read(context.Background())
			if err != nil {
				ended <- err
				return
			}
			msgs <- string(m)
		}
	}()
	return msgs, ended
}

func noEnd(t *testing.T, ended chan error, who string) {
	t.Helper()
	select {
	case err := <-ended:
		t.Fatalf("%s: the studio's socket ended: %v", who, err)
	default:
	}
}

// harborGotInOrder checks harbor got the hello then frames 0..n-1, once each.
func harborGotInOrder(t *testing.T, h *fakeHarbor, slug, prefix string, n int64) {
	t.Helper()
	eventually(t, slug+": every frame at harbor", func() bool { return int64(len(h.got(slug))) == n+1 })
	got := h.got(slug)
	if got[0].typ != websocket.MessageText || !strings.Contains(string(got[0].data), `"hello"`) {
		t.Fatalf("%s: first frame %q", slug, got[0].data)
	}
	for i, f := range got[1:] {
		if !bytes.Equal(f.data, frameN(prefix, int64(i))) {
			t.Fatalf("%s: frame %d is %q", slug, i, f.data)
		}
	}
}

func icecastBytes(prefix string, n int64) []byte {
	var b bytes.Buffer
	for i := int64(0); i < n; i++ {
		b.Write(frameN(prefix, i))
	}
	return b.Bytes()
}

// A container show moves to the other copy mid-stream: harbor keeps its one
// connection and every frame in order, the studio its socket, the pings
// carry on from the new copy, and harbor's messages still reach the studio.
func TestHandoffHarborShowNeverNotices(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.PingInterval = 30 * time.Millisecond
	cfg.HarborWriteTimeout = 2 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)

	var pings atomic.Int64
	ctx := context.Background()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(hsA.URL, "http")+"/relay/broadcast/a", &websocket.DialOptions{
		Subprotocols: []string{"webcast"},
		HTTPClient:   &http.Client{Transport: &http.Transport{DialContext: countingDialer(&pings)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	msgs, ended := watchStudio(c)
	c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	st := startStream(c, "a", time.Millisecond)
	eventually(t, "audio at harbor", func() bool { return len(h.got("a")) > 50 })

	a.handOffAll(toB)
	if a.Active() != 0 || b.Active() != 1 || a.Metrics.handedOutTotal(PathHarbor) != 1 || b.Metrics.handedInTotal(PathHarbor) != 1 {
		t.Fatalf("after: a=%d b=%d out=%d in=%d", a.Active(), b.Active(), a.Metrics.handedOutTotal(PathHarbor), b.Metrics.handedInTotal(PathHarbor))
	}
	p0 := pings.Load()
	time.Sleep(200 * time.Millisecond)
	if pings.Load() <= p0 {
		t.Fatal("no pings from the copy that took the show")
	}
	h.conn("a").Write(ctx, websocket.MessageText, []byte("from harbor"))
	select {
	case m := <-msgs:
		if m != "from harbor" {
			t.Fatalf("studio got %q", m)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("harbor's message never reached the studio")
	}
	n := st.finish(t)
	noEnd(t, ended, "a")
	harborGotInOrder(t, h, "a", "a", n)

	c.Close(websocket.StatusNormalClosure, "show over")
	if e := h.waitEnd(t); e.code != websocket.StatusNormalClosure {
		t.Fatalf("harbor saw %d, want the studio's 1000 through the new copy", e.code)
	}
	eventually(t, "the end counted on the new copy", func() bool { return b.Metrics.Closes("harbor_client_closed") == 1 })
	if h.dials.Load() != 1 {
		t.Fatalf("harbor dialled %d times", h.dials.Load())
	}
	var m strings.Builder
	a.Metrics.Render(&m)
	if strings.Contains(m.String(), "relay_closes_total") {
		t.Fatalf("the old copy counted a close:\n%s", m.String())
	}
}

// A Free show moves mid-stream: Icecast keeps its one source connection and
// gets every byte, in order.
func TestHandoffIcecastShowNeverNotices(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.PingInterval = 30 * time.Millisecond
	cfg.IdleTimeout = 5 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)

	c := dial(t, hsA, nil)
	defer c.CloseNow()
	c.Write(context.Background(), websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, c)
	_, ended := watchStudio(c)
	st := startStream(c, "f", time.Millisecond)
	eventually(t, "audio at icecast", func() bool { return len(ice.received()) > 1000 })
	a.handOffAll(toB)
	if a.Active() != 0 || b.Active() != 1 {
		t.Fatalf("a=%d b=%d", a.Active(), b.Active())
	}
	time.Sleep(100 * time.Millisecond)
	n := st.finish(t)
	noEnd(t, ended, "f")
	want := icecastBytes("f", n)
	eventually(t, "every byte at icecast", func() bool { return bytes.Equal(ice.received(), want) })
	if ice.requestCount() != 1 {
		t.Fatalf("%d source logins", ice.requestCount())
	}
	c.Close(websocket.StatusNormalClosure, "")
	eventually(t, "counted on the new copy", func() bool { return b.Metrics.Closes("client_closed") == 1 })
}

// The idle clock moves with the show: a studio that stopped sending just
// before the hand-off is cut IdleTimeout after its last audio, not later.
func TestHandoffKeepsTheIdleClock(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 600 * time.Millisecond
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	c := dial(t, hsA, nil)
	defer c.CloseNow()
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, c)
	c.Write(ctx, websocket.MessageBinary, []byte("last audio"))
	last := time.Now()
	time.Sleep(300 * time.Millisecond)
	a.handOffAll(toB)
	_, ended := watchStudio(c)
	select {
	case err := <-ended:
		if websocket.CloseStatus(err) != CloseIdle {
			t.Fatalf("studio got %v, want 1008", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("never cut for idling")
	}
	if d := time.Since(last); d < 550*time.Millisecond || d > 900*time.Millisecond {
		t.Fatalf("cut %s after the last audio, want ~600ms", d)
	}
	eventually(t, "idle counted on the new copy", func() bool { return b.Metrics.Closes("idle") == 1 })
}

// Both paths, several studios, the sessions thrown back and forth between
// two copies twenty times while audio flows. Nothing is lost, nothing
// reconnects.
func TestHandoffBackAndForthUnderLoad(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.IdleTimeout = 5 * time.Second
	cfg.HarborWriteTimeout = 2 * time.Second
	cfg.PingInterval = 20 * time.Millisecond
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toA, toB := listenHandoff(t, a), listenHandoff(t, b)

	ctx := context.Background()
	var streams []*streamer
	var endeds []chan error
	for i := 0; i < 3; i++ {
		slug := fmt.Sprintf("pro-%d", i)
		c := studio(t, hsA, slug)
		defer c.CloseNow()
		_, ended := watchStudio(c)
		c.Write(ctx, websocket.MessageText, helloJSON(slug, "t"))
		streams = append(streams, startStream(c, slug, 500*time.Microsecond))
		endeds = append(endeds, ended)
	}
	// One Free studio: the fake Icecast keeps one byte stream for all.
	free := dial(t, hsA, nil)
	defer free.CloseNow()
	free.Write(ctx, websocket.MessageText, helloJSON("free", "t"))
	expectOK(t, free)
	_, freeEnded := watchStudio(free)
	freeStream := startStream(free, "free", 500*time.Microsecond)

	time.Sleep(50 * time.Millisecond)
	for i := 0; i < 20; i++ {
		from, to, want := a, toB, b
		if i%2 == 1 {
			from, to, want = b, toA, a
		}
		from.handOffAll(to)
		if from.Active() != 0 || want.Active() != 4 {
			t.Fatalf("round %d: %d left behind, %d moved", i, from.Active(), want.Active())
		}
		time.Sleep(time.Duration(10+i*3) * time.Millisecond)
	}
	for i, st := range streams {
		n := st.finish(t)
		noEnd(t, endeds[i], st.prefix)
		harborGotInOrder(t, h, st.prefix, st.prefix, n)
	}
	n := freeStream.finish(t)
	noEnd(t, freeEnded, "free")
	want := icecastBytes("free", n)
	eventually(t, "every Free byte", func() bool { return bytes.Equal(ice.received(), want) })
	if h.dials.Load() != 3 || ice.requestCount() != 1 {
		t.Fatalf("reconnects: harbor dials %d, icecast logins %d", h.dials.Load(), ice.requestCount())
	}
	if out := a.Metrics.handedOutTotal(PathHarbor) + b.Metrics.handedOutTotal(PathHarbor); out != 60 {
		t.Fatalf("%d harbor hand-offs, want 60", out)
	}
}

// A hand-off lands with half a frame read, and another in the middle of a
// fragmented message: both arrive whole.
func TestHandoffMidFrameAndMidMessage(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.PingInterval = 0
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toA, toB := listenHandoff(t, a), listenHandoff(t, b)
	var snaps []*sessionSnap
	testHookSnapshot = func(s *sessionSnap) { snaps = append(snaps, s) }
	defer func() { testHookSnapshot = nil }()

	c := rawStudio(t, strings.TrimPrefix(hsA.URL, "http://"), "/relay/broadcast/a")
	c.writeFrame(true, opText, helloJSON("a", "t"))
	eventually(t, "hello at harbor", func() bool { return len(h.got("a")) == 1 })

	whole := appendFrame(nil, true, opBinary, []byte("one frame, split by a hand-off"), true)
	c.nc.Write(whole[:9])
	time.Sleep(50 * time.Millisecond) // let the relay read the first half
	a.handOffAll(toB)
	c.nc.Write(whole[9:])

	c.nc.Write(appendFrame(nil, false, opBinary, []byte("first half of a message, "), true))
	time.Sleep(50 * time.Millisecond)
	b.handOffAll(toA)
	c.nc.Write(appendFrame(nil, true, opContinuation, []byte("second half"), true))

	eventually(t, "both at harbor", func() bool { return len(h.got("a")) == 3 })
	got := h.got("a")
	if string(got[1].data) != "one frame, split by a hand-off" || string(got[2].data) != "first half of a message, second half" {
		t.Fatalf("harbor got %q, %q", got[1].data, got[2].data)
	}
	if len(snaps) != 2 || len(snaps[0].Studio.RBuf) != 9 || snaps[1].Studio.MsgOp != opBinary {
		t.Fatalf("snapshots did not catch the cases: %d, rbuf %d, msgOp %d", len(snaps), len(snaps[0].Studio.RBuf), snaps[1].Studio.MsgOp)
	}
	if h.dials.Load() != 1 {
		t.Fatal("harbor reconnected")
	}
}

// slowHarbor is a harbor that does not read for `pause`, then reads
// everything: once the socket buffers fill, the relay's writes to it block,
// so a hand-off catches one half-written. (A small receive buffer would
// block sooner but also crawls once reading starts: TCP's delayed ACKs.)
type slowHarbor struct {
	ln     net.Listener
	pause  time.Duration
	mu     sync.Mutex
	frames [][]byte
	dials  atomic.Int64
}

func newSlowHarbor(t *testing.T, pause time.Duration) *slowHarbor {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	sh := &slowHarbor{ln: ln, pause: pause}
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			sh.dials.Add(1)
			go sh.serve(t, nc)
		}
	}()
	return sh
}

func (sh *slowHarbor) serve(t *testing.T, nc net.Conn) {
	defer nc.Close()
	br := bufio.NewReader(nc)
	req, err := http.ReadRequest(br)
	if err != nil {
		return
	}
	nc.Write([]byte("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
		acceptKey(req.Header.Get("Sec-WebSocket-Key")) + "\r\nSec-WebSocket-Protocol: webcast\r\n\r\n"))
	time.Sleep(sh.pause)
	left, _ := br.Peek(br.Buffered())
	c := newWSConn(nc, false, 1<<20, time.Second, left)
	for {
		f, err := c.readFrame()
		if err != nil {
			return
		}
		sh.mu.Lock()
		sh.frames = append(sh.frames, append([]byte(nil), f.payload...)) // the payload is only valid until the next read
		sh.mu.Unlock()
	}
}

func (sh *slowHarbor) count() int {
	sh.mu.Lock()
	defer sh.mu.Unlock()
	return len(sh.frames)
}

// Bytes the relay owed harbor, half-written when the hand-off came, are
// written by the copy that takes over, before anything else.
func TestHandoffCarriesUnwrittenBytes(t *testing.T) {
	sh := newSlowHarbor(t, 1500*time.Millisecond)
	cfg := harborConfig(sh.ln.Addr().String())
	cfg.HarborWriteTimeout = 10 * time.Second
	cfg.PingInterval = 0
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	var pending atomic.Int64
	testHookSnapshot = func(s *sessionSnap) { pending.Store(int64(len(s.Up.Pending))) }
	defer func() { testHookSnapshot = nil }()

	c := studio(t, hsA, "a")
	defer c.CloseNow()
	ctx := context.Background()
	const frames = 800 // 25 MB: more than every buffer on the way
	payload := func(i int) []byte { return bytes.Repeat([]byte{byte(i)}, 32<<10) }
	go func() {
		c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
		for i := 0; i < frames; i++ {
			if c.Write(ctx, websocket.MessageBinary, payload(i)) != nil {
				return
			}
		}
	}()
	time.Sleep(700 * time.Millisecond) // the relay is stuck writing to harbor by now
	a.handOffAll(toB)
	if pending.Load() == 0 {
		t.Fatal("the hand-off did not catch a write in flight; the test proves nothing")
	}
	t.Logf("%d bytes owed to harbor carried over", pending.Load())
	deadline := time.Now().Add(10 * time.Second)
	for sh.count() < frames+1 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	sh.mu.Lock()
	defer sh.mu.Unlock()
	if len(sh.frames) != frames+1 {
		t.Fatalf("harbor got %d frames, want %d", len(sh.frames), frames+1)
	}
	for i := 0; i < frames; i++ {
		if !bytes.Equal(sh.frames[i+1], payload(i)) {
			t.Fatalf("frame %d corrupted", i)
		}
	}
	if sh.dials.Load() != 1 {
		t.Fatal("harbor reconnected")
	}
}

// A copy that is itself draining takes nothing: the retiring copy falls back
// to the old way (Free told to reconnect, container shows kept to the end).
func TestDrainingCopyRefusesAndTheOldWayFollows(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.IdleTimeout = 10 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	b.mu.Lock()
	b.draining = true
	b.mu.Unlock()

	ctx := context.Background()
	free := dial(t, hsA, nil)
	free.Write(ctx, websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, free)
	pro := studio(t, hsA, "p")
	pro.Write(ctx, websocket.MessageText, helloJSON("p", "t"))
	eventually(t, "pro at harbor", func() bool { return h.conn("p") != nil })

	retired := make(chan struct{})
	go func() { a.RetireVia(time.Minute, &toB); close(retired) }()
	if got := readUntilClose(t, free); got != CloseDraining {
		t.Fatalf("free studio got %d, want 1001", got)
	}
	if err := pro.Write(ctx, websocket.MessageBinary, []byte("still here")); err != nil {
		t.Fatal(err)
	}
	select {
	case <-retired:
		t.Fatal("retired with a container show still on")
	case <-time.After(300 * time.Millisecond):
	}
	pro.Close(websocket.StatusNormalClosure, "")
	<-retired
	if a.Metrics.handedOutTotal(PathHarbor)+a.Metrics.handedOutTotal(PathIcecast) != 0 || b.Active() != 0 {
		t.Fatal("something was handed to a draining copy")
	}
}

// Sessions are only handed to the process the other copy's /healthz named:
// a socket under that name held by any other process gets nothing.
func TestHandoffOnlyToTheNamedProcess(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	toB.PID = os.Getpid() + 1 // what an impostor bound under the name would look like
	pro := studio(t, hsA, "p")
	defer pro.CloseNow()
	pro.Write(context.Background(), websocket.MessageText, helloJSON("p", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("p") != nil })
	a.handOffAll(toB)
	if a.Active() != 1 || b.Active() != 0 {
		t.Fatalf("handed to the wrong process: a=%d b=%d", a.Active(), b.Active())
	}
	if _, err := dialHandoff(toB); err == nil || !strings.Contains(err.Error(), "pid") {
		t.Fatalf("dial: %v", err)
	}
}

// liveSession is the one session on s.
func liveSession(t *testing.T, s *Server) *session {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	for ss := range s.conns {
		return ss
	}
	t.Fatal("no session")
	return nil
}

// The sender dies between "ready" and "commit": the receiver lets its
// copies go without a sound, and the show carries on where it was.
func TestNoCommitLeavesTheShowWhereItWas(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	c := studio(t, hsA, "a")
	defer c.CloseNow()
	_, ended := watchStudio(c)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	st := startStream(c, "a", time.Millisecond)
	eventually(t, "audio", func() bool { return len(h.got("a")) > 20 })

	ss := liveSession(t, a)
	uc, err := dialHandoff(toB)
	if err != nil {
		t.Fatal(err)
	}
	if !ss.freeze(time.Second) {
		t.Fatal("freeze failed")
	}
	snap := ss.snapshot()
	conns := []net.Conn{ss.studio.nc, ss.up.nc}
	if err := withFDs(conns, nil, func(fds []int) error { return writeHmsg(uc, hmsg{T: "session", S: snap}, fds) }); err != nil {
		t.Fatal(err)
	}
	if m, _, err := readHmsg(uc); err != nil || m.T != "ready" {
		t.Fatalf("got %+v %v", m, err)
	}
	uc.Close() // and the sender "dies" before commit
	eventually(t, "the receiver let go", func() bool { return b.Active() == 0 })
	ss.unfreeze()

	time.Sleep(100 * time.Millisecond)
	n := st.finish(t)
	noEnd(t, ended, "a")
	harborGotInOrder(t, h, "a", "a", n)
	if b.Metrics.handedInTotal(PathHarbor) != 0 || a.Active() != 1 || h.dials.Load() != 1 {
		t.Fatal("the show moved or reconnected")
	}
}

// A drain that hits a session mid-hand-off ends it here, with 1001, and the
// hand-off is called off: never both copies acting on the same sockets.
func TestDrainMidHandoffWins(t *testing.T) {
	h := newFakeHarbor(t)
	a, hsA := quietRelay(t, harborConfig(h.addr()))
	c := studio(t, hsA, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "at harbor", func() bool { return h.conn("a") != nil })
	ss := liveSession(t, a)
	if !ss.freeze(time.Second) {
		t.Fatal("freeze failed")
	}
	expired, cancel := context.WithTimeout(context.Background(), 0)
	defer cancel()
	go a.Drain(expired)
	if got := readUntilClose(t, c); got != CloseDraining {
		t.Fatalf("studio got %d, want 1001", got)
	}
	called := false
	sent, err := ss.commitTo(func() error { called = true; return nil })
	if sent || err != nil || called {
		t.Fatalf("committed a session that had ended: sent=%v err=%v called=%v", sent, err, called)
	}
	if e := h.waitEnd(t); e.code != -1 {
		t.Fatalf("harbor saw %d", e.code)
	}
}

// A Free studio still saying hello when its copy retires goes live there and
// is handed over then.
func TestSessionGoingLiveIsHandedOnceLive(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.HelloTimeout = 2 * time.Second
	cfg.IdleTimeout = 5 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	c := dial(t, hsA, nil)
	defer c.CloseNow()
	retired := make(chan struct{})
	go func() { a.RetireVia(time.Minute, &toB); close(retired) }()
	time.Sleep(300 * time.Millisecond)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("f", "t"))
	expectOK(t, c)
	_, ended := watchStudio(c)
	st := startStream(c, "f", time.Millisecond)
	select {
	case <-retired:
	case <-time.After(5 * time.Second):
		t.Fatal("RetireVia never finished")
	}
	if b.Active() != 1 || a.Active() != 0 {
		t.Fatalf("a=%d b=%d", a.Active(), b.Active())
	}
	n := st.finish(t)
	noEnd(t, ended, "f")
	want := icecastBytes("f", n)
	eventually(t, "every byte", func() bool { return bytes.Equal(ice.received(), want) })
}

// The whole rollover with hand-offs: the stale copy hands its show over and
// returns at once, instead of waiting for the show to end.
func TestRolloverHandsOffInsteadOfWaiting(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.HarborWriteTimeout = 2 * time.Second
	a, hsA := quietRelay(t, cfg)
	b, _ := quietRelay(t, cfg)
	toB := listenHandoff(t, b)
	// b's /healthz as main serves it: the socket it really listens on.
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		st := b.State()
		json.NewEncoder(w).Encode(Health{PID: os.Getpid(), Draining: st.Draining, Retiring: st.Retiring,
			Handoff: HandoffVersion, HandoffSocket: st.HandoffSocket})
	}))
	t.Cleanup(health.Close)
	if b.State().HandoffSocket != toB.Socket {
		t.Fatalf("b reports socket %q, listens on %q", b.State().HandoffSocket, toB.Socket)
	}

	c := studio(t, hsA, "a")
	defer c.CloseNow()
	_, ended := watchStudio(c)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	st := startStream(c, "a", time.Millisecond)
	eventually(t, "audio", func() bool { return len(h.got("a")) > 20 })

	exe := writeExe(t, t.TempDir(), "build-1")
	r := rolloverFor(t, exe, []string{strings.TrimPrefix(health.URL, "http://")}, fmt.Sprintf("@gocast-relay-roll-%d", time.Now().UnixNano()))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan bool, 1)
	go func() { done <- r.Run(ctx, a, t.Logf) }()
	replaceExe(t, exe, "build-2")
	select {
	case ok := <-done:
		if !ok {
			t.Fatal("Run returned false")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the stale copy waited instead of handing off")
	}
	if b.Active() != 1 {
		t.Fatal("the show is not on the other copy")
	}
	time.Sleep(100 * time.Millisecond)
	n := st.finish(t)
	noEnd(t, ended, "a")
	harborGotInOrder(t, h, "a", "a", n)
}

func TestReadyPeerNeedsTheSameHandoffVersion(t *testing.T) {
	var h atomic.Pointer[Health]
	addr := fakePeer(t, &h)
	r := &Rollover{Peers: []string{addr}}
	// The socket is the one the peer reports, however its address is
	// spelled in the peer list.
	h.Store(&Health{PID: 42, Handoff: HandoffVersion, HandoffSocket: "@its-own-name"})
	if tgt, ok := r.readyPeer(context.Background()); !ok || tgt == nil || tgt.PID != 42 || tgt.Socket != "@its-own-name" {
		t.Fatalf("got %+v %v", tgt, ok)
	}
	// No socket reported: no hand-off, rather than a guessed name.
	h.Store(&Health{PID: 42, Handoff: HandoffVersion})
	if tgt, ok := r.readyPeer(context.Background()); !ok || tgt != nil {
		t.Fatalf("no socket: got %+v %v", tgt, ok)
	}
	for _, v := range []int{0, HandoffVersion + 1} {
		h.Store(&Health{PID: 42, Handoff: v, HandoffSocket: "@x"})
		if tgt, ok := r.readyPeer(context.Background()); !ok || tgt != nil {
			t.Fatalf("version %d: got %+v %v, want ready without hand-offs", v, tgt, ok)
		}
	}
}

func TestReceiverRefusesAnotherVersion(t *testing.T) {
	b, _ := quietRelay(t, DefaultConfig())
	to := listenHandoff(t, b)
	c, err := net.Dial("unix", to.Socket)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	uc := c.(*net.UnixConn)
	writeHmsg(uc, hmsg{T: "hello", V: HandoffVersion + 1}, nil)
	m, _, err := readHmsg(uc)
	if err != nil || m.T != "refuse" {
		t.Fatalf("got %+v %v", m, err)
	}
}

// A link frozen mid-write keeps exactly what the kernel did not take, and a
// new link on the same socket writes it before anything else.
func TestFrozenWriteKeepsTheRest(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := make(chan []byte, 1)
	release := make(chan struct{})
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		<-release
		var b bytes.Buffer
		b.ReadFrom(c)
		got <- b.Bytes()
	}()
	nc, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	l := newLink(nc, 10*time.Second)
	data := bytes.Repeat([]byte("0123456789"), 2<<20) // 20 MB: more than every buffer
	wrote := make(chan error, 1)
	go func() { wrote <- l.write(data) }()
	time.Sleep(300 * time.Millisecond)
	l.freeze()
	if err := <-wrote; err != nil {
		t.Fatalf("frozen write: %v", err)
	}
	l.write([]byte("after")) // queued behind the rest
	snap := snapLink(&l)
	if len(snap.Pending) == 0 || len(snap.Pending) >= len(data)+5 {
		t.Fatalf("pending %d", len(snap.Pending))
	}
	// The other process's link on the same socket.
	l2 := newLink(nc, 10*time.Second)
	restorePending(&l2, snap)
	nc.SetWriteDeadline(time.Time{})
	close(release)
	if err := l2.write(nil); err != nil {
		t.Fatal(err)
	}
	nc.Close()
	if b := <-got; !bytes.Equal(b, append(data, "after"...)) {
		t.Fatalf("peer got %d bytes, want %d exactly", len(b), len(data)+5)
	}
}
