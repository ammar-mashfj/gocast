package relay

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeIcecast accepts source connections and answers each with `answer`.
// After a 200 it records every byte the relay forwards.
type fakeIcecast struct {
	t      *testing.T
	ln     net.Listener
	answer string // full response, e.g. "HTTP/1.0 200 OK\r\n\r\n"
	noRead bool   // after answering, never read (to fill the socket)
	hangUp time.Duration

	mu       sync.Mutex
	requests []string
	got      bytes.Buffer
	conns    []net.Conn
	closed   chan struct{} // receives when a source connection ends
}

func newFakeIcecast(t *testing.T, answer string) *fakeIcecast {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeIcecast{t: t, ln: ln, answer: answer, closed: make(chan struct{}, 16)}
	go f.loop()
	t.Cleanup(func() { ln.Close() })
	return f
}

func (f *fakeIcecast) loop() {
	for {
		c, err := f.ln.Accept()
		if err != nil {
			return
		}
		go f.handle(c)
	}
}

func (f *fakeIcecast) handle(c net.Conn) {
	defer func() { c.Close(); f.closed <- struct{}{} }()
	f.mu.Lock()
	f.conns = append(f.conns, c)
	f.mu.Unlock()
	br := bufio.NewReader(c)
	var req strings.Builder
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		req.WriteString(line)
		if line == "\r\n" {
			break
		}
	}
	f.mu.Lock()
	f.requests = append(f.requests, req.String())
	f.mu.Unlock()
	// Like Icecast 2.5: without Expect: 100-continue an accepted PUT gets no
	// answer at all, so a relay that waits for one would hang.
	if !strings.Contains(req.String(), "Expect: 100-continue\r\n") && strings.Contains(f.answer, " 100 ") {
		return
	}
	io.WriteString(c, f.answer)
	if !strings.Contains(f.answer, " 200 ") && !strings.Contains(f.answer, " 100 ") {
		return
	}
	if f.hangUp > 0 {
		time.Sleep(f.hangUp)
		return
	}
	if f.noRead {
		select {}
	}
	buf := make([]byte, 32<<10)
	for {
		n, err := br.Read(buf)
		f.mu.Lock()
		f.got.Write(buf[:n])
		f.mu.Unlock()
		if err != nil {
			return
		}
	}
}

func (f *fakeIcecast) received() []byte {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]byte(nil), f.got.Bytes()...)
}

func (f *fakeIcecast) requestCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.requests)
}

// What Icecast 2.5 actually sends on an accepted PUT with Expect: 100-continue.
const ok200 = "HTTP/1.1 100 Continue\r\nServer: Icecast 2.5.0\r\nContent-Length: 0\r\n\r\n"

func testConfig(addr string) Config {
	c := DefaultConfig()
	c.IcecastAddr = addr
	c.IcecastHost = "127.0.0.1"
	c.HelloTimeout = 500 * time.Millisecond
	c.IcecastTimeout = 1 * time.Second
	c.IdleTimeout = 500 * time.Millisecond
	c.WriteTimeout = 300 * time.Millisecond
	c.BusyRetryFor = 300 * time.Millisecond
	c.BusyRetryEvery = 50 * time.Millisecond
	return c
}

func startRelay(t *testing.T, cfg Config) (*Server, *httptest.Server) {
	s := New(cfg)
	hs := httptest.NewServer(s)
	t.Cleanup(hs.Close)
	return s, hs
}

func dial(t *testing.T, hs *httptest.Server, opts *websocket.DialOptions) *websocket.Conn {
	t.Helper()
	if opts == nil {
		opts = &websocket.DialOptions{Subprotocols: []string{"webcast"}}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(hs.URL, "http"), opts)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return c
}

func helloJSON(slug, token string) []byte {
	b, _ := json.Marshal(map[string]any{"type": "hello", "data": map[string]any{
		"mime": "audio/mpeg", "user": slug, "password": token, "audio": map[string]any{"bitrate": 128},
	}})
	return b
}

// readUntilClose returns the close code the relay sent (or -1).
func readUntilClose(t *testing.T, c *websocket.Conn) websocket.StatusCode {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for {
		_, _, err := c.Read(ctx)
		if err != nil {
			return websocket.CloseStatus(err)
		}
	}
}

func expectOK(t *testing.T, c *websocket.Conn) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	typ, msg, err := c.Read(ctx)
	if err != nil || typ != websocket.MessageText || string(msg) != `{"type":"ok"}` {
		t.Fatalf("expected ok, got %v %q %v", typ, msg, err)
	}
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for: %s", what)
}

func TestHappyPathForwardsExactBytes(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("night-shift", "1793.abc_DEF-123"))
	expectOK(t, c)

	var want bytes.Buffer
	for i := 0; i < 50; i++ {
		frame := bytes.Repeat([]byte{byte(i)}, 417)
		want.Write(frame)
		if err := c.Write(ctx, websocket.MessageBinary, frame); err != nil {
			t.Fatal(err)
		}
		if i == 10 {
			c.Write(ctx, websocket.MessageText, []byte(`{"type":"metadata","data":{"title":"x"}}`)) // ignored
		}
	}
	eventually(t, "all bytes at icecast", func() bool { return bytes.Equal(ice.received(), want.Bytes()) })

	req := ice.requests[0]
	auth := base64.StdEncoding.EncodeToString([]byte("night-shift:1793.abc_DEF-123"))
	for _, line := range []string{
		"PUT /stream/night-shift HTTP/1.1\r\n",
		"Authorization: Basic " + auth + "\r\n",
		"Content-Type: audio/mpeg\r\n",
		"Expect: 100-continue\r\n",
	} {
		if !strings.Contains(req, line) {
			t.Errorf("request missing %q:\n%s", line, req)
		}
	}
	if !strings.HasPrefix(req, "PUT /stream/night-shift HTTP/1.1\r\n") {
		t.Errorf("request line: %q", req)
	}
}

func TestClientCloseClosesIcecast(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	c.Close(websocket.StatusNormalClosure, "bye")
	select {
	case <-ice.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("icecast connection was not closed")
	}
}

func TestIcecastAnswers(t *testing.T) {
	cases := []struct {
		name   string
		answer string
		want   websocket.StatusCode
	}{
		{"unauthorized", "HTTP/1.0 401 Authentication Required\r\nContent-Type: text/plain\r\n\r\nYou need to authenticate\r\n", CloseRejected},
		{"forbidden", "HTTP/1.0 403 Forbidden\r\n\r\n", CloseRejected},
		{"plain 200 also accepted", "HTTP/1.0 200 OK\r\n\r\n", 0},
		{"busy", "HTTP/1.0 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nMountpoint in use\r\n", CloseBusy},
		{"server error", "HTTP/1.0 500 Internal Server Error\r\n\r\n", CloseIcecastDown},
		{"garbage", "hello\r\n\r\n", CloseIcecastDown},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ice := newFakeIcecast(t, tc.answer)
			_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
			c := dial(t, hs, nil)
			c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
			if tc.want == 0 {
				expectOK(t, c)
				return
			}
			if got := readUntilClose(t, c); got != tc.want {
				t.Fatalf("close code %d, want %d", got, tc.want)
			}
		})
	}
}

func TestIcecastUnreachable(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := ln.Addr().String()
	ln.Close() // nothing listens here now
	_, hs := startRelay(t, testConfig(addr))
	c := dial(t, hs, nil)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	if got := readUntilClose(t, c); got != CloseIcecastDown {
		t.Fatalf("close code %d, want %d", got, CloseIcecastDown)
	}
}

func TestIcecastSilentAfterConnect(t *testing.T) {
	// Accepts TCP but never answers (e.g. stuck waiting on the API).
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c // hold it open, say nothing
		}
	}()
	cfg := testConfig(ln.Addr().String())
	_, hs := startRelay(t, cfg)
	c := dial(t, hs, nil)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	start := time.Now()
	if got := readUntilClose(t, c); got != CloseIcecastDown {
		t.Fatalf("close code %d, want %d", got, CloseIcecastDown)
	}
	if d := time.Since(start); d < cfg.IcecastTimeout-100*time.Millisecond {
		t.Fatalf("gave up after %s, before the %s timeout", d, cfg.IcecastTimeout)
	}
}

func TestBadHellosNeverReachIcecast(t *testing.T) {
	cases := map[string][]byte{
		"not json":       []byte("hi"),
		"wrong type":     []byte(`{"type":"metadata","data":{}}`),
		"wrong mime":     []byte(`{"type":"hello","data":{"mime":"audio/ogg","user":"a","password":"t"}}`),
		"empty slug":     helloJSON("", "tok"),
		"upper slug":     helloJSON("Night", "tok"),
		"path slug":      helloJSON("../admin", "tok"),
		"crlf slug":      helloJSON("a\r\nX-Evil: 1", "tok"),
		"space in token": helloJSON("a", "to k"),
		"crlf token":     helloJSON("a", "tok\r\nGET /admin"),
		"empty token":    helloJSON("a", ""),
		"long token":     helloJSON("a", strings.Repeat("x", 513)),
		"long slug":      helloJSON(strings.Repeat("a", 65), "tok"),
	}
	ice := newFakeIcecast(t, ok200)
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	for name, msg := range cases {
		t.Run(name, func(t *testing.T) {
			c := dial(t, hs, nil)
			c.Write(context.Background(), websocket.MessageText, msg)
			if got := readUntilClose(t, c); got != CloseBadHello {
				t.Fatalf("close code %d, want %d", got, CloseBadHello)
			}
		})
	}
	t.Run("binary first", func(t *testing.T) {
		c := dial(t, hs, nil)
		c.Write(context.Background(), websocket.MessageBinary, []byte{0xff, 0xfb})
		if got := readUntilClose(t, c); got != CloseBadHello {
			t.Fatalf("close code %d, want %d", got, CloseBadHello)
		}
	})
	if n := ice.requestCount(); n != 0 {
		t.Fatalf("icecast was dialed %d time(s) for bad hellos", n)
	}
}

func TestHelloTimeout(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	s, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	readUntilClose(t, c)
	eventually(t, "no_hello counted", func() bool { return s.Metrics.Closes("no_hello") == 1 })
	if ice.requestCount() != 0 {
		t.Fatal("icecast dialed without a hello")
	}
}

func TestIcecastClosesMidStream(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	ice.hangUp = 200 * time.Millisecond // like admin killsource
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	go func() {
		for i := 0; i < 100; i++ {
			if c.Write(ctx, websocket.MessageBinary, make([]byte, 400)) != nil {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	}()
	if got := readUntilClose(t, c); got != CloseSourceKilled {
		t.Fatalf("close code %d, want %d", got, CloseSourceKilled)
	}
}

func TestIdleStudioIsClosed(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	s, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	// send nothing, and do not read either: the source must be released
	// without waiting on the studio's half of the close handshake.
	select {
	case <-ice.closed:
	case <-time.After(3 * time.Second):
		t.Fatal("icecast not closed after idle timeout")
	}
	c.Read(context.Background()) // answer the close, as a browser does
	eventually(t, "idle counted", func() bool { return s.Metrics.Closes("idle") == 1 })
}

// The studio's drop report reads the close code; an idle close must arrive as
// 1008, not as the abnormal 1006 of a dropped connection.
func TestIdleStudioIsToldWhy(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _, err := c.Read(ctx)
	if got := websocket.CloseStatus(err); got != CloseIdle {
		t.Fatalf("studio got close %d (%v), want %d", got, err, CloseIdle)
	}
}

// Audio keeps the idle timer from firing, however long the show.
func TestSteadyAudioIsNotIdle(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	s, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	for i := 0; i < 15; i++ { // 1.5s of audio against a 500ms idle timeout
		if err := c.Write(ctx, websocket.MessageBinary, []byte("frame")); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
		time.Sleep(100 * time.Millisecond)
	}
	if n := s.Metrics.Closes("idle"); n != 0 {
		t.Fatalf("idle closes = %d during steady audio", n)
	}
}

// Cloudflare closes a socket after 100 min with nothing travelling from the
// origin to the browser, and audio only goes the other way. The relay's pings
// are that traffic, so they must keep coming for the whole show.
func TestStudioIsPingedThroughoutTheShow(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.PingInterval = 100 * time.Millisecond
	s, hs := startRelay(t, cfg)
	var pings atomic.Int32
	c := dial(t, hs, &websocket.DialOptions{
		Subprotocols:   []string{"webcast"},
		OnPingReceived: func(context.Context, []byte) bool { pings.Add(1); return true },
	})
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	// A real studio reads its socket all show long; that read is what answers
	// the pings.
	go func() {
		for {
			if _, _, err := c.Read(ctx); err != nil {
				return
			}
		}
	}()
	for i := 0; i < 10; i++ { // 1s of audio
		c.Write(ctx, websocket.MessageBinary, []byte("frame"))
		time.Sleep(100 * time.Millisecond)
	}
	if n := pings.Load(); n < 5 {
		t.Fatalf("studio got %d pings in 1s at a 100ms interval", n)
	}
	if n := s.Metrics.Closes("idle") + s.Metrics.Closes("client_closed"); n != 0 {
		t.Fatalf("show ended during pings (%d)", n)
	}
}

// A studio that never answers a ping keeps broadcasting: only missing audio
// ends a show.
func TestUnansweredPingsDoNotEndTheShow(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.PingInterval = 50 * time.Millisecond
	s, hs := startRelay(t, cfg)
	c := dial(t, hs, nil) // never reads after ok, so never pongs
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	for i := 0; i < 10; i++ {
		if err := c.Write(ctx, websocket.MessageBinary, []byte("frame")); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
		time.Sleep(100 * time.Millisecond)
	}
	eventually(t, "audio at icecast", func() bool { return len(ice.received()) == 50 })
	if n := s.Metrics.active.Load(); n != 1 {
		t.Fatalf("active = %d, want the show still open", n)
	}
}

func TestOversizeMessage(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.MaxMessage = 1024
	_, hs := startRelay(t, cfg)
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	c.Write(ctx, websocket.MessageBinary, make([]byte, 4096))
	if got := readUntilClose(t, c); got != websocket.StatusMessageTooBig {
		t.Fatalf("close code %d, want %d", got, websocket.StatusMessageTooBig)
	}
	select {
	case <-ice.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("icecast not closed")
	}
}

func TestStuckIcecastWriteTimesOut(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	ice.noRead = true
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	done := make(chan websocket.StatusCode, 1)
	go func() { done <- readUntilClose(t, c) }()
	chunk := make([]byte, 60<<10)
	for i := 0; i < 2000; i++ { // up to ~120 MB; kernel buffers fill long before
		if c.Write(ctx, websocket.MessageBinary, chunk) != nil {
			break
		}
		select {
		case code := <-done:
			if code != CloseSourceKilled {
				t.Fatalf("close code %d, want %d", code, CloseSourceKilled)
			}
			return
		default:
		}
	}
	select {
	case code := <-done:
		if code != CloseSourceKilled {
			t.Fatalf("close code %d, want %d", code, CloseSourceKilled)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("relay never gave up on a stuck icecast")
	}
}

func TestOriginAndSubprotocol(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.OriginPatterns = []string{"gocast.fm"}
	_, hs := startRelay(t, cfg)
	url := "ws" + strings.TrimPrefix(hs.URL, "http")
	ctx := context.Background()

	_, resp, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		Subprotocols: []string{"webcast"},
		HTTPHeader:   http.Header{"Origin": []string{"https://evil.example"}},
	})
	if err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign origin: err=%v resp=%v", err, resp)
	}

	c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		Subprotocols: []string{"webcast"},
		HTTPHeader:   http.Header{"Origin": []string{"https://gocast.fm"}},
	})
	if err != nil {
		t.Fatalf("allowed origin refused: %v", err)
	}
	c.CloseNow()

	c, _, err = websocket.Dial(ctx, url, &websocket.DialOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if got := readUntilClose(t, c); got != websocket.StatusPolicyViolation {
		t.Fatalf("no subprotocol: close %d", got)
	}
}

func TestDrainWaitsThenCloses(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 10 * time.Second
	s, hs := startRelay(t, cfg)
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)

	drained := make(chan struct{})
	dctx, cancel := context.WithTimeout(ctx, 400*time.Millisecond)
	defer cancel()
	go func() { s.Drain(dctx); close(drained) }()

	// While draining: the open show keeps flowing...
	time.Sleep(100 * time.Millisecond)
	if err := c.Write(ctx, websocket.MessageBinary, []byte("still-live")); err != nil {
		t.Fatalf("existing connection broke during drain: %v", err)
	}
	eventually(t, "frame forwarded during drain", func() bool { return bytes.Contains(ice.received(), []byte("still-live")) })
	// ...and new studios are turned away.
	resp, err := http.Get(hs.URL)
	if err != nil || resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("new connection during drain: %v %v", resp, err)
	}

	// At the deadline the rest are closed with 1001.
	if got := readUntilClose(t, c); got != CloseDraining {
		t.Fatalf("close code %d, want %d", got, CloseDraining)
	}
	<-drained
	// Counted as the restart's drop, not the studio leaving.
	if d, c := s.Metrics.Closes("draining"), s.Metrics.Closes("client_closed"); d != 1 || c != 0 {
		t.Fatalf("closes: draining=%d client_closed=%d, want 1 and 0", d, c)
	}
}

func TestDrainIsNotHeldUpBySilentStudios(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 30 * time.Second
	s, hs := startRelay(t, cfg)
	ctx := context.Background()

	// Studios that stop reading never answer the close frame, so the relay
	// waits its full 5 s on each.
	for i := range 3 {
		c := dial(t, hs, nil)
		c.Write(ctx, websocket.MessageText, helloJSON(fmt.Sprintf("silent-%d", i), "tok"))
		expectOK(t, c)
		t.Cleanup(func() { c.CloseNow() })
	}
	healthy := dial(t, hs, nil)
	healthy.Write(ctx, websocket.MessageText, helloJSON("healthy", "tok"))
	expectOK(t, healthy)

	expired, cancel := context.WithTimeout(ctx, 0)
	defer cancel()
	start := time.Now()
	drained := make(chan struct{})
	go func() { s.Drain(expired); close(drained) }()

	if got := readUntilClose(t, healthy); got != CloseDraining {
		t.Fatalf("close code %d, want %d", got, CloseDraining)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("healthy studio told to reconnect after %s, behind the silent ones", d)
	}
	select {
	case <-drained:
	case <-time.After(8 * time.Second): // one 5 s wait, not three in a row
		t.Fatal("drain took longer than the slowest single studio")
	}
}

func TestRefusalWithoutBodyIsReportedPromptly(t *testing.T) {
	// Answers with headers only and keeps the socket open.
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				bufio.NewReader(c).ReadString('\n')
				io.WriteString(c, "HTTP/1.0 401 Authentication Required\r\n\r\n")
			}()
		}
	}()
	cfg := testConfig(ln.Addr().String())
	cfg.IcecastTimeout = 5 * time.Second
	_, hs := startRelay(t, cfg)
	c := dial(t, hs, nil)
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	start := time.Now()
	if got := readUntilClose(t, c); got != CloseRejected {
		t.Fatalf("close code %d, want %d", got, CloseRejected)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("refusal took %s to reach the studio", d)
	}
}

func TestMetrics(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	s, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	c := dial(t, hs, nil)
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	c.Write(ctx, websocket.MessageBinary, make([]byte, 1000))
	eventually(t, "bytes counted", func() bool { return s.Metrics.bytes.Load() == 1000 })
	c.Close(websocket.StatusNormalClosure, "")
	eventually(t, "close counted", func() bool { return s.Metrics.Closes("client_closed") == 1 })
	var b bytes.Buffer
	s.Metrics.Render(&b)
	for _, want := range []string{"relay_connections_total 1", "relay_bytes_in_total 1000", `relay_closes_total{reason="client_closed"} 1`} {
		if !strings.Contains(b.String(), want) {
			t.Errorf("metrics missing %q:\n%s", want, b.String())
		}
	}
}

func TestManyConcurrentStations(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	_, hs := startRelay(t, testConfig(ice.ln.Addr().String()))
	var wg sync.WaitGroup
	errs := make(chan error, 200)
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(hs.URL, "http"), &websocket.DialOptions{Subprotocols: []string{"webcast"}})
			if err != nil {
				errs <- err
				return
			}
			defer c.CloseNow()
			c.Write(ctx, websocket.MessageText, helloJSON("s", "t"))
			if _, msg, err := c.Read(ctx); err != nil || string(msg) != `{"type":"ok"}` {
				errs <- errors.New("no ok")
				return
			}
			for j := 0; j < 10; j++ {
				c.Write(ctx, websocket.MessageBinary, make([]byte, 400))
			}
			c.Close(websocket.StatusNormalClosure, "")
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	eventually(t, "all bytes", func() bool { return len(ice.received()) == 200*10*400 })
}

func FuzzParseHello(f *testing.F) {
	f.Add(helloJSON("a", "tok"))
	f.Add([]byte(`{"type":"hello","data":{"mime":"audio/mpeg","user":"a\r\n","password":"x"}}`))
	f.Add([]byte(`{}`))
	f.Fuzz(func(t *testing.T, b []byte) {
		slug, token, err := ParseHello(b)
		if err != nil {
			return
		}
		req := SourceRequest(DefaultConfig(), slug, token)
		// Whatever got through must not be able to add lines to the request.
		if strings.Count(req, "\r\n") != 8 || strings.ContainsAny(slug, " \r\n/") {
			t.Fatalf("unsafe request from %q:\n%q", b, req)
		}
	})
}

// Icecast's <source-timeout> (infra/native/icecast/icecast.xml.tpl) is 10 s.
// The relay must give up on a silent studio first, so the studio hears 1008
// "no audio" from the relay rather than 4005 from Icecast cutting the source.
func TestIdleTimeoutIsUnderIcecastSourceTimeout(t *testing.T) {
	const icecastSourceTimeout = 10 * time.Second
	if got := DefaultConfig().IdleTimeout; got >= icecastSourceTimeout-time.Second {
		t.Fatalf("idle timeout %s is not safely under Icecast's %s", got, icecastSourceTimeout)
	}
}

// A drain frees each studio's mount before the close handshake, which can take
// seconds: the studio reconnecting through the other copy must not find its
// own old source still holding the mount (4009).
func TestDrainReleasesTheSourceBeforeTheCloseHandshake(t *testing.T) {
	ice := newFakeIcecast(t, ok200)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 30 * time.Second
	s, hs := startRelay(t, cfg)
	ctx := context.Background()

	// Stops reading after ok, so it never answers the close frame and the
	// relay's Close waits its full 5 s.
	c := dial(t, hs, nil)
	c.Write(ctx, websocket.MessageText, helloJSON("a", "tok"))
	expectOK(t, c)
	t.Cleanup(func() { c.CloseNow() })

	expired, cancel := context.WithTimeout(ctx, 0)
	defer cancel()
	drained := make(chan struct{})
	go func() { s.Drain(expired); close(drained) }()

	select {
	case <-ice.closed:
	case <-time.After(time.Second):
		t.Fatal("the Icecast source was still held a second into the drain")
	}
	<-drained // after the 5 s the silent studio's close handshake waits
	if n := s.Metrics.Closes("draining"); n != 1 {
		t.Fatalf("draining = %d, want the drop counted as the restart's", n)
	}
	if n := s.Metrics.Closes("icecast_closed"); n != 0 {
		t.Fatalf("icecast_closed = %d: the relay's own release was blamed on Icecast", n)
	}
}

// mountIcecast behaves like Icecast about one thing the other fakes ignore:
// a mount holds one source. A second login while it is held is refused
// "Mountpoint in use", and a source that goes away frees the mount only after
// `releaseDelay`, as Icecast's source thread takes a moment to wind down.
type mountIcecast struct {
	ln           net.Listener
	releaseDelay time.Duration

	mu     sync.Mutex
	holder map[string]net.Conn // mount -> the source holding it
	logins int
	busy   int
	got    map[net.Conn]*bytes.Buffer
}

func newMountIcecast(t *testing.T, releaseDelay time.Duration) *mountIcecast {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	m := &mountIcecast{ln: ln, releaseDelay: releaseDelay, holder: map[string]net.Conn{}, got: map[net.Conn]*bytes.Buffer{}}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go m.handle(c)
		}
	}()
	return m
}

func (m *mountIcecast) handle(c net.Conn) {
	defer c.Close()
	br := bufio.NewReader(c)
	first, err := br.ReadString('\n')
	if err != nil {
		return
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		if line == "\r\n" {
			break
		}
	}
	mount := strings.Fields(first)[1]
	m.mu.Lock()
	m.logins++
	if m.holder[mount] != nil {
		m.busy++
		m.mu.Unlock()
		io.WriteString(c, "HTTP/1.0 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nMountpoint in use\r\n")
		return
	}
	m.holder[mount] = c
	buf := &bytes.Buffer{}
	m.got[c] = buf
	m.mu.Unlock()
	io.WriteString(c, ok200)
	chunk := make([]byte, 32<<10)
	for {
		n, err := br.Read(chunk)
		m.mu.Lock()
		buf.Write(chunk[:n])
		m.mu.Unlock()
		if err != nil {
			break
		}
	}
	time.Sleep(m.releaseDelay)
	m.mu.Lock()
	if m.holder[mount] == c {
		delete(m.holder, mount)
	}
	m.mu.Unlock()
}

// kill is Icecast's /admin/killsource: the source connection is closed from
// Icecast's side, and the mount frees after releaseDelay.
func (m *mountIcecast) kill(mount string) {
	m.mu.Lock()
	c := m.holder[mount]
	m.mu.Unlock()
	if c != nil {
		c.Close()
	}
}

func (m *mountIcecast) held(mount string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.holder[mount] != nil
}

func (m *mountIcecast) holderBytes(mount string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c := m.holder[mount]; c != nil {
		return m.got[c].Len()
	}
	return 0
}

func (m *mountIcecast) counts() (logins, busy int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.logins, m.busy
}

// connectStudio dials, says hello and waits for the relay's answer: nil error
// on {"type":"ok"}, else the close code.
func connectStudio(t *testing.T, hs *httptest.Server, slug string) (*websocket.Conn, websocket.StatusCode) {
	t.Helper()
	c := dial(t, hs, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c.Write(ctx, websocket.MessageText, helloJSON(slug, "tok"))
	typ, msg, err := c.Read(ctx)
	if err != nil {
		return nil, websocket.CloseStatus(err)
	}
	if typ != websocket.MessageText || string(msg) != `{"type":"ok"}` {
		t.Fatalf("unexpected first message %q", msg)
	}
	return c, 0
}

// The bug this fixes: a phone whose network dies sends no close, so its
// source keeps the mount until the idle timeout. Laravel cuts that source
// when the phone asks for a token to reconnect; the reconnect can still land
// before Icecast has let go, and must get in rather than be told 4009.
func TestReconnectGetsInWhileIcecastReleasesACutSource(t *testing.T) {
	ice := newMountIcecast(t, 150*time.Millisecond)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 30 * time.Second // the dead phone is not noticed by the timer
	cfg.BusyRetryFor = 2 * time.Second
	cfg.BusyRetryEvery = 50 * time.Millisecond
	s, hs := startRelay(t, cfg)

	dead, code := connectStudio(t, hs, "a")
	if code != 0 {
		t.Fatalf("first connect refused %d", code)
	}
	t.Cleanup(func() { dead.CloseNow() })
	dead.Write(context.Background(), websocket.MessageBinary, []byte("old phone"))
	// The phone's network dies: no close, no more frames. Laravel cuts the
	// source as the reconnect asks for its token.
	ice.kill("/stream/a")

	start := time.Now()
	back, code := connectStudio(t, hs, "a")
	if code != 0 {
		t.Fatalf("reconnect refused with %d; want it admitted once Icecast lets go", code)
	}
	defer back.CloseNow()
	if d := time.Since(start); d > time.Second {
		t.Fatalf("reconnect took %s", d)
	}
	if s.Metrics.BusyRetries() == 0 {
		t.Fatal("expected the reconnect to have waited out the release")
	}
	back.Write(context.Background(), websocket.MessageBinary, []byte("new phone"))
	eventually(t, "the new phone's audio on the mount", func() bool { return ice.holderBytes("/stream/a") > 0 })
	if n := s.Metrics.Closes("busy"); n != 0 {
		t.Fatalf("busy closes = %d, want none", n)
	}
}

// A station whose source is alive and stays alive (nobody cut it) is still
// refused after the retry window, and the show already on air is not touched
// by the relay.
func TestLiveStationStillRefusesAnotherSourceAfterRetrying(t *testing.T) {
	ice := newMountIcecast(t, 0)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 30 * time.Second
	cfg.BusyRetryFor = 400 * time.Millisecond
	cfg.BusyRetryEvery = 100 * time.Millisecond
	s, hs := startRelay(t, cfg)

	live, code := connectStudio(t, hs, "a")
	if code != 0 {
		t.Fatalf("first connect refused %d", code)
	}
	defer live.CloseNow()
	live.Write(context.Background(), websocket.MessageBinary, []byte("on air"))
	eventually(t, "the show's audio", func() bool { return ice.holderBytes("/stream/a") > 0 })

	start := time.Now()
	_, code = connectStudio(t, hs, "a")
	if code != CloseBusy {
		t.Fatalf("second source got %d, want %d", code, CloseBusy)
	}
	d := time.Since(start)
	if d < 300*time.Millisecond || d > 2*time.Second {
		t.Fatalf("refusal after %s; want it after the ~400ms retry window", d)
	}
	if _, busy := ice.counts(); busy < 3 {
		t.Fatalf("Icecast was asked %d times while busy; want the relay to have retried", busy)
	}
	eventually(t, "the refusal counted as busy", func() bool { return s.Metrics.Closes("busy") == 1 })

	// The show on air kept the mount and still goes through.
	before := ice.holderBytes("/stream/a")
	live.Write(context.Background(), websocket.MessageBinary, []byte(" still on air"))
	eventually(t, "the show still forwarding", func() bool { return ice.holderBytes("/stream/a") > before })
}

// Without a cut, a dead phone's mount comes free at the idle timeout and the
// reconnect gets in on its next try.
func TestDeadStudioFreesTheMountAtTheIdleTimeout(t *testing.T) {
	ice := newMountIcecast(t, 0)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 400 * time.Millisecond
	cfg.BusyRetryFor = 0
	_, hs := startRelay(t, cfg)

	dead, code := connectStudio(t, hs, "a")
	if code != 0 {
		t.Fatalf("first connect refused %d", code)
	}
	t.Cleanup(func() { dead.CloseNow() })

	if _, code := connectStudio(t, hs, "a"); code != CloseBusy {
		t.Fatalf("reconnect inside the idle window got %d, want %d", code, CloseBusy)
	}
	eventually(t, "the idle timeout freeing the mount", func() bool { return !ice.held("/stream/a") })
	back, code := connectStudio(t, hs, "a")
	if code != 0 {
		t.Fatalf("reconnect after the idle timeout got %d", code)
	}
	back.CloseNow()
}

// Only "in use" is worth asking again: a refused token is refused at once.
func TestOnlyBusyIsRetried(t *testing.T) {
	ice := newFakeIcecast(t, "HTTP/1.0 401 Authentication Required\r\n\r\nYou need to authenticate\r\n")
	cfg := testConfig(ice.ln.Addr().String())
	cfg.BusyRetryFor = 2 * time.Second
	s, hs := startRelay(t, cfg)

	start := time.Now()
	if _, code := connectStudio(t, hs, "a"); code != CloseRejected {
		t.Fatalf("got %d, want %d", code, CloseRejected)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("a refused token took %s to reach the studio", d)
	}
	if n := ice.requestCount(); n != 1 {
		t.Fatalf("Icecast asked %d times, want 1", n)
	}
	if s.Metrics.BusyRetries() != 0 {
		t.Fatal("a 401 was retried")
	}
}

// Other stations are not held up by one station's retries.
func TestBusyRetryIsPerStation(t *testing.T) {
	ice := newMountIcecast(t, 0)
	cfg := testConfig(ice.ln.Addr().String())
	cfg.IdleTimeout = 30 * time.Second
	cfg.BusyRetryFor = 2 * time.Second
	cfg.BusyRetryEvery = 100 * time.Millisecond
	_, hs := startRelay(t, cfg)

	a, _ := connectStudio(t, hs, "a")
	defer a.CloseNow()
	// A second source for station a: the relay keeps asking Icecast for 2 s.
	waiting := dial(t, hs, nil)
	defer waiting.CloseNow()
	waiting.Write(context.Background(), websocket.MessageText, helloJSON("a", "tok"))
	time.Sleep(150 * time.Millisecond)

	start := time.Now()
	b, code := connectStudio(t, hs, "b")
	if code != 0 {
		t.Fatalf("station b refused %d", code)
	}
	defer b.CloseNow()
	if d := time.Since(start); d > 500*time.Millisecond {
		t.Fatalf("station b waited %s behind station a's retries", d)
	}
}

// A retry that Icecast does not answer must not run past the budget: the
// studio waits 12 s for an answer and would report a generic timeout.
func TestSlowRetryStaysInsideTheBudget(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	t.Cleanup(func() { ln.Close() })
	var logins atomic.Int32
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				bufio.NewReader(c).ReadString('\n')
				if logins.Add(1) == 1 {
					io.WriteString(c, "HTTP/1.0 403 Forbidden\r\n\r\nMountpoint in use\r\n")
					c.Close()
					return
				}
				// Every later login hangs: Icecast stuck on the auth call.
				time.Sleep(5 * time.Second)
				c.Close()
			}(c)
		}
	}()
	cfg := testConfig(ln.Addr().String())
	cfg.IcecastTimeout = 5 * time.Second
	cfg.BusyRetryFor = 600 * time.Millisecond
	cfg.BusyRetryEvery = 100 * time.Millisecond
	_, hs := startRelay(t, cfg)

	start := time.Now()
	if _, code := connectStudio(t, hs, "a"); code != CloseBusy {
		t.Fatalf("got %d, want %d (still in use as far as anyone knows)", code, CloseBusy)
	}
	if d := time.Since(start); d > 1500*time.Millisecond {
		t.Fatalf("answered after %s; the retry budget is 600ms", d)
	}
}

func TestDefaultsGiveUpADeadStudioInFourSeconds(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.IdleTimeout != 4*time.Second {
		t.Fatalf("idle timeout %s, want 4s", cfg.IdleTimeout)
	}
	if cfg.BusyRetryFor <= 0 || cfg.BusyRetryEvery <= 0 || cfg.BusyRetryEvery >= cfg.BusyRetryFor {
		t.Fatalf("busy retry %s every %s is not a retry", cfg.BusyRetryFor, cfg.BusyRetryEvery)
	}
}
