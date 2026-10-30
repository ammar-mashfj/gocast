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
	// send nothing
	select {
	case <-ice.closed:
	case <-time.After(3 * time.Second):
		t.Fatal("icecast not closed after idle timeout")
	}
	eventually(t, "idle counted", func() bool { return s.Metrics.Closes("idle") == 1 })
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
