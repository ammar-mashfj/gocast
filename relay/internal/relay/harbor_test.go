package relay

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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

// fakeHarbor stands in for the station router + Liquidsoap harbor at
// /broadcast/{slug}, behaving the way the real one was measured to (2026-11-16,
// gocast/liquidsoap through the local router):
//
//   - echoes the "webcast" subprotocol;
//   - a refused token: close 1011 "Authentication failed.";
//   - a second source on a held mount, and a silent source after its
//     timeout: a TCP drop with no close frame;
//   - a station that is off: the router answers the upgrade with 502.
type fakeHarbor struct {
	t  *testing.T
	hs *httptest.Server

	refuse   bool          // close 1011 after the hello
	refuseAt int           // with refuse: close after this many frames (default 1)
	noRead   bool          // accept, then never read (a wedged harbor)
	silentAt time.Duration // drop the TCP connection this long after the last frame

	mu      sync.Mutex
	frames  []frame
	headers []http.Header
	paths   []string
	conns   map[string]*websocket.Conn
	ends    chan end // one per finished connection
	dials   atomic.Int64
	offline map[string]bool
}

type frame struct {
	slug string
	typ  websocket.MessageType
	data []byte
}

type end struct {
	slug string
	code websocket.StatusCode // what the relay closed us with; -1 = dropped
}

func newFakeHarbor(t *testing.T) *fakeHarbor {
	f := &fakeHarbor{t: t, conns: map[string]*websocket.Conn{}, ends: make(chan end, 64), offline: map[string]bool{}}
	f.hs = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.hs.Close)
	return f
}

func (f *fakeHarbor) addr() string { return strings.TrimPrefix(f.hs.URL, "http://") }

func (f *fakeHarbor) serve(w http.ResponseWriter, r *http.Request) {
	f.dials.Add(1)
	slug := strings.TrimPrefix(r.URL.Path, "/broadcast/")
	f.mu.Lock()
	f.paths = append(f.paths, r.URL.Path)
	f.headers = append(f.headers, r.Header.Clone())
	off := f.offline[slug]
	_, held := f.conns[slug]
	f.mu.Unlock()
	if off {
		http.Error(w, "bad gateway", http.StatusBadGateway)
		return
	}
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"webcast"}})
	if err != nil {
		return
	}
	if held {
		// Mount_taken: harbor drops the newcomer without a close frame.
		c.CloseNow()
		f.ends <- end{slug, -1}
		return
	}
	f.mu.Lock()
	f.conns[slug] = c
	f.mu.Unlock()
	defer func() {
		f.mu.Lock()
		if f.conns[slug] == c {
			delete(f.conns, slug)
		}
		f.mu.Unlock()
	}()
	c.SetReadLimit(1 << 20)

	if f.noRead {
		<-r.Context().Done()
		select {}
	}
	ctx := context.Background()
	for {
		rctx, cancel := ctx, context.CancelFunc(func() {})
		if f.silentAt > 0 {
			rctx, cancel = context.WithTimeout(ctx, f.silentAt)
		}
		typ, data, err := c.Read(rctx)
		cancel()
		if err != nil {
			code := websocket.CloseStatus(err)
			if errors.Is(err, context.DeadlineExceeded) {
				c.CloseNow() // harbor's input timeout: no close frame
				code = -2
			}
			f.ends <- end{slug, code}
			return
		}
		f.mu.Lock()
		f.frames = append(f.frames, frame{slug, typ, data})
		n := len(f.frames)
		f.mu.Unlock()
		at := f.refuseAt
		if at == 0 {
			at = 1
		}
		if f.refuse && n == at {
			c.Close(websocket.StatusInternalError, "Authentication failed.")
			f.ends <- end{slug, 0}
			return
		}
	}
}

func (f *fakeHarbor) got(slug string) []frame {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []frame
	for _, fr := range f.frames {
		if fr.slug == slug {
			out = append(out, fr)
		}
	}
	return out
}

func (f *fakeHarbor) conn(slug string) *websocket.Conn {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.conns[slug]
}

func (f *fakeHarbor) waitEnd(t *testing.T) end {
	t.Helper()
	select {
	case e := <-f.ends:
		return e
	case <-time.After(3 * time.Second):
		t.Fatal("harbor connection never ended")
		return end{}
	}
}

func harborConfig(addr string) Config {
	c := testConfig("127.0.0.1:1") // the Icecast path must never be used here
	c.HarborAddr = addr
	c.HarborTimeout = time.Second
	c.HarborWriteTimeout = 300 * time.Millisecond
	return c
}

func dialPath(t *testing.T, hs *httptest.Server, path string, opts *websocket.DialOptions) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	if opts == nil {
		opts = &websocket.DialOptions{Subprotocols: []string{"webcast"}}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return websocket.Dial(ctx, "ws"+strings.TrimPrefix(hs.URL, "http")+path, opts)
}

func studio(t *testing.T, hs *httptest.Server, slug string) *websocket.Conn {
	t.Helper()
	c, _, err := dialPath(t, hs, "/relay/broadcast/"+slug, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return c
}

func TestHarborPathParsing(t *testing.T) {
	for path, want := range map[string]string{
		"/relay/broadcast/night-shift":                "night-shift",
		"/broadcast/night-shift":                      "night-shift",
		"/relay/broadcast/a":                          "a",
		"/relay/broadcast/" + strings.Repeat("a", 63): strings.Repeat("a", 63),
	} {
		if got, ok := HarborSlug(path); !ok || got != want {
			t.Errorf("%q: got %q %v, want %q", path, got, ok, want)
		}
	}
	for _, path := range []string{
		"/relay", "/relay/broadcast/", "/relay/broadcast/Night", "/relay/broadcast/-x",
		"/relay/broadcast/a/b", "/relay/broadcast/../x", "/relay/broadcast/a%2fb",
		"/relay/broadcast/" + strings.Repeat("a", 64), "/other/broadcast/x", "/relay/broadcast/x/",
		"/relay/broadcast/a.b", "/relay/broadcast/a_b",
	} {
		if got, ok := HarborSlug(path); ok {
			t.Errorf("%q accepted as %q", path, got)
		}
	}
}

func TestHarborPassesEveryFrameThroughUntouched(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "night-shift")
	if c.Subprotocol() != "webcast" {
		t.Fatalf("subprotocol %q", c.Subprotocol())
	}
	ctx := context.Background()

	hello := helloJSON("night-shift", "tok.123")
	meta := []byte(`{"type":"metadata","data":{"title":"Song","artist":"Band"}}`)
	want := []frame{{"night-shift", websocket.MessageText, hello}}
	c.Write(ctx, websocket.MessageText, hello)
	for i := 0; i < 200; i++ {
		data := bytes.Repeat([]byte{byte(i)}, 417+i)
		c.Write(ctx, websocket.MessageBinary, data)
		want = append(want, frame{"night-shift", websocket.MessageBinary, data})
		if i == 100 {
			c.Write(ctx, websocket.MessageText, meta)
			want = append(want, frame{"night-shift", websocket.MessageText, meta})
		}
	}
	eventually(t, "every frame at harbor", func() bool { return len(h.got("night-shift")) == len(want) })
	got := h.got("night-shift")
	for i := range want {
		if got[i].typ != want[i].typ || !bytes.Equal(got[i].data, want[i].data) {
			t.Fatalf("frame %d: got %v %d bytes, want %v %d bytes", i, got[i].typ, len(got[i].data), want[i].typ, len(want[i].data))
		}
	}
	// The relay never speaks for harbor: no {"type":"ok"}, nothing at all.
	rctx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
	defer cancel()
	if typ, msg, err := c.Read(rctx); err == nil {
		t.Fatalf("relay sent the studio %v %q", typ, msg)
	}
	if h.paths[0] != "/broadcast/night-shift" {
		t.Fatalf("dialled %q", h.paths[0])
	}
	if s.Metrics.Closes("harbor_client_closed") != 0 {
		t.Fatal("counted a close too early")
	}
}

func TestHarborMessagesReachTheStudio(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "harbor has the studio", func() bool { return h.conn("a") != nil })
	h.conn("a").Write(ctx, websocket.MessageText, []byte(`{"from":"harbor"}`))
	h.conn("a").Write(ctx, websocket.MessageBinary, []byte{1, 2, 3})
	rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	typ, msg, err := c.Read(rctx)
	if err != nil || typ != websocket.MessageText || string(msg) != `{"from":"harbor"}` {
		t.Fatalf("got %v %q %v", typ, msg, err)
	}
	typ, msg, err = c.Read(rctx)
	if err != nil || typ != websocket.MessageBinary || !bytes.Equal(msg, []byte{1, 2, 3}) {
		t.Fatalf("got %v %q %v", typ, msg, err)
	}
}

func TestHarborRefusalReachesTheStudioWithItsCode(t *testing.T) {
	h := newFakeHarbor(t)
	h.refuse = true
	_, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "bad"))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _, err := c.Read(ctx)
	var ce websocket.CloseError
	if !errors.As(err, &ce) || ce.Code != websocket.StatusInternalError || ce.Reason != "Authentication failed." {
		t.Fatalf("studio got %v, want 1011 Authentication failed.", err)
	}
}

func TestHarborDropIsADropForTheStudio(t *testing.T) {
	// A silent studio: harbor's input timeout drops the TCP connection with
	// no close frame, and the studio must see the same, not a made-up code.
	h := newFakeHarbor(t)
	h.silentAt = 300 * time.Millisecond
	s, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	if e := h.waitEnd(t); e.code != -2 {
		t.Fatalf("harbor end %+v", e)
	}
	if got := readUntilClose(t, c); got != -1 {
		t.Fatalf("studio close %d, want a drop (-1)", got)
	}
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_closed") == 1 })
	if s.Active() != 0 {
		t.Fatal("connection still tracked")
	}
}

func TestSecondSourceIsDroppedLikeHarborDoes(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	a := studio(t, hs, "a")
	a.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "first holds the mount", func() bool { return h.conn("a") != nil })
	b := studio(t, hs, "a")
	if got := readUntilClose(t, b); got != -1 {
		t.Fatalf("second source close %d, want a drop", got)
	}
	// The first show is untouched.
	if err := a.Write(context.Background(), websocket.MessageBinary, []byte("still")); err != nil {
		t.Fatal(err)
	}
	eventually(t, "first still flowing", func() bool {
		g := h.got("a")
		return len(g) > 0 && string(g[len(g)-1].data) == "still"
	})
}

func TestStudioCloseReachesHarborWithItsCode(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "connected", func() bool { return h.conn("a") != nil })
	c.Close(websocket.StatusNormalClosure, "show over")
	if e := h.waitEnd(t); e.code != websocket.StatusNormalClosure {
		t.Fatalf("harbor saw %d, want 1000", e.code)
	}
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_client_closed") == 1 })
}

func TestStudioVanishingDropsHarborAtOnce(t *testing.T) {
	// A studio whose TCP connection just ends (tab killed): harbor must be
	// let go now, not at its 10 s timeout, so the reconnect finds the mount free.
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "connected", func() bool { return h.conn("a") != nil })
	start := time.Now()
	c.CloseNow()
	if e := h.waitEnd(t); e.code != -1 {
		t.Fatalf("harbor saw %d, want a drop", e.code)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("harbor freed after %v", d)
	}
	eventually(t, "mount free", func() bool { return h.conn("a") == nil })
}

func TestHarborOffFailsTheUpgradeWithTheRoutersStatus(t *testing.T) {
	h := newFakeHarbor(t)
	h.offline["sleepy"] = true
	s, hs := startRelay(t, harborConfig(h.addr()))
	_, resp, err := dialPath(t, hs, "/relay/broadcast/sleepy", nil)
	if err == nil || resp == nil || resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("err=%v resp=%v, want 502", err, resp)
	}
	if s.Metrics.Closes("harbor_unreachable") != 1 || s.Active() != 0 {
		t.Fatal("not counted, or left tracked")
	}
}

func TestRouterDownFailsTheUpgrade(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := ln.Addr().String()
	ln.Close() // nothing listens here now
	_, hs := startRelay(t, harborConfig(addr))
	_, resp, err := dialPath(t, hs, "/relay/broadcast/a", nil)
	if err == nil || resp == nil || resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("err=%v resp=%v, want 502", err, resp)
	}
}

func TestRouterThatNeverAnswersIsGivenUp(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			defer c.Close() // accept, then say nothing
		}
	}()
	cfg := harborConfig(ln.Addr().String())
	cfg.HarborTimeout = 300 * time.Millisecond
	_, hs := startRelay(t, cfg)
	start := time.Now()
	_, resp, err := dialPath(t, hs, "/relay/broadcast/a", nil)
	if err == nil || resp == nil || resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("err=%v resp=%v, want 502", err, resp)
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("took %v", d)
	}
}

func TestPassThroughOffOrMalformedIs404(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig("")
	_, hs := startRelay(t, cfg)
	for _, p := range []string{"/relay/broadcast/a", "/broadcast/a"} {
		_, resp, err := dialPath(t, hs, p, nil)
		if err == nil || resp == nil || resp.StatusCode != http.StatusNotFound {
			t.Fatalf("%s with pass-through off: err=%v resp=%v", p, err, resp)
		}
	}
	_, hs = startRelay(t, harborConfig(h.addr()))
	for _, p := range []string{"/relay/broadcast/Bad", "/relay/broadcast/a/b", "/relay/broadcast/", "/x/broadcast/a"} {
		_, resp, err := dialPath(t, hs, p, nil)
		if err == nil || resp == nil || resp.StatusCode != http.StatusNotFound {
			t.Fatalf("%s: err=%v resp=%v, want 404", p, err, resp)
		}
	}
	if h.dials.Load() != 0 {
		t.Fatalf("harbor dialled %d times", h.dials.Load())
	}
}

func TestHarborOriginIsCheckedBeforeDialling(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.OriginPatterns = []string{"gocast.fm", "*.gocast.fm"}
	_, hs := startRelay(t, cfg)

	_, resp, err := dialPath(t, hs, "/relay/broadcast/a", &websocket.DialOptions{
		Subprotocols: []string{"webcast"},
		HTTPHeader:   http.Header{"Origin": []string{"https://evil.example"}},
	})
	if err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign origin: err=%v resp=%v", err, resp)
	}
	if h.dials.Load() != 0 {
		t.Fatal("harbor dialled for a foreign origin")
	}
	for _, o := range []string{"https://gocast.fm", "https://www.gocast.fm", ""} {
		hdr := http.Header{}
		if o != "" {
			hdr.Set("Origin", o)
		}
		c, _, err := dialPath(t, hs, "/relay/broadcast/a", &websocket.DialOptions{Subprotocols: []string{"webcast"}, HTTPHeader: hdr})
		if err != nil {
			t.Fatalf("origin %q refused: %v", o, err)
		}
		c.Close(websocket.StatusNormalClosure, "")
		h.waitEnd(t)
	}
}

func TestBroadcasterHeadersAreCarriedToTheRouter(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	c, _, err := dialPath(t, hs, "/relay/broadcast/a", &websocket.DialOptions{
		Subprotocols: []string{"webcast"},
		HTTPHeader: http.Header{
			"X-Forwarded-For": []string{"203.0.113.9"},
			"X-Real-Ip":       []string{"203.0.113.9"},
			"User-Agent":      []string{"StudioBrowser/1.0"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	hd := h.headers[0]
	if hd.Get("X-Forwarded-For") != "203.0.113.9" || hd.Get("X-Real-Ip") != "203.0.113.9" || hd.Get("User-Agent") != "StudioBrowser/1.0" {
		t.Fatalf("headers at router: %v", hd)
	}
	if hd.Get("Sec-Websocket-Protocol") != "webcast" {
		t.Fatalf("subprotocol offered to router: %q", hd.Get("Sec-Websocket-Protocol"))
	}
}

func TestHarborStudioIsPingedThroughTheShow(t *testing.T) {
	// Harbor sends nothing during a show; the relay's pings are the only
	// bytes towards the browser, which is what Cloudflare needs to see.
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.PingInterval = 50 * time.Millisecond
	_, hs := startRelay(t, cfg)

	var pings atomic.Int64
	// coder/websocket answers pings without telling us; count them by
	// wrapping the client's connection.
	ctx := context.Background()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(hs.URL, "http")+"/relay/broadcast/a", &websocket.DialOptions{
		Subprotocols: []string{"webcast"},
		HTTPClient:   &http.Client{Transport: &http.Transport{DialContext: countingDialer(&pings)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	go func() {
		for {
			if _, _, err := c.Read(ctx); err != nil {
				return
			}
		}
	}()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	for i := 0; i < 10; i++ {
		c.Write(ctx, websocket.MessageBinary, []byte("audio"))
		time.Sleep(40 * time.Millisecond)
	}
	if n := pings.Load(); n < 5 {
		t.Fatalf("studio got %d pings in 400 ms at a 50 ms interval", n)
	}
}

// countingDialer counts ping frames (opcode 0x9) arriving from the server.
// Server frames are unmasked and these are small, so a ping is the 2-byte
// header 0x89 <len> followed by its payload.
func countingDialer(n *atomic.Int64) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		var d net.Dialer
		c, err := d.DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		return &pingCounter{Conn: c, n: n}, nil
	}
}

type pingCounter struct {
	net.Conn
	n *atomic.Int64
}

func (p *pingCounter) Read(b []byte) (int, error) {
	k, err := p.Conn.Read(b)
	p.n.Add(int64(bytes.Count(b[:k], []byte{0x89})))
	return k, err
}

func TestHarborThatStopsReadingEndsTheShow(t *testing.T) {
	h := newFakeHarbor(t)
	h.noRead = true
	s, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	ctx := context.Background()
	done := make(chan websocket.StatusCode, 1)
	go func() { done <- readUntilClose(t, c) }()
	// Fill every buffer between the studio and harbor. The studio's own
	// writes get a long deadline: a short one would make the studio drop
	// its own socket, which is not what is being tested.
	big := bytes.Repeat([]byte{7}, 60<<10)
	go func() {
		for i := 0; i < 400; i++ {
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.Write(wctx, websocket.MessageBinary, big)
			cancel()
			if err != nil {
				return
			}
		}
	}()
	select {
	case code := <-done:
		if code != CloseHarborWrite {
			var b strings.Builder
			s.Metrics.Render(&b)
			t.Fatalf("studio close %d, want %d\n%s", code, CloseHarborWrite, b.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("studio never told")
	}
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_write") == 1 })
}

func TestHarborOversizeStudioMessage(t *testing.T) {
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.MaxMessage = 1024
	s, hs := startRelay(t, cfg)
	c := studio(t, hs, "a")
	c.Write(context.Background(), websocket.MessageText, helloJSON("a", "t"))
	c.Write(context.Background(), websocket.MessageBinary, make([]byte, 4096))
	if got := readUntilClose(t, c); got != websocket.StatusMessageTooBig {
		t.Fatalf("close %d", got)
	}
	h.waitEnd(t)
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_too_big") == 1 })
}

func TestHarborDrainLetsGoOfHarborBeforeTellingTheStudio(t *testing.T) {
	// The studio reconnects the moment it reads 1001, through the other copy.
	// Harbor must have let go of the mount by then or the reconnect is
	// dropped as a second source.
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	_, hs2 := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "connected", func() bool { return h.conn("a") != nil })

	expired, cancel := context.WithTimeout(ctx, 0)
	defer cancel()
	go s.Drain(expired)

	if got := readUntilClose(t, c); got != CloseDraining {
		t.Fatalf("close %d, want 1001", got)
	}
	// Reconnect at once through the other copy.
	c2 := studio(t, hs2, "a")
	defer c2.CloseNow()
	c2.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	c2.Write(ctx, websocket.MessageBinary, []byte("back"))
	eventually(t, "reconnect carried", func() bool {
		g := h.got("a")
		return len(g) > 0 && string(g[len(g)-1].data) == "back"
	})
	eventually(t, "counted as the restart's", func() bool { return s.Metrics.Closes("harbor_draining") == 1 })
	if n := s.Metrics.Closes("harbor_closed") + s.Metrics.Closes("harbor_client_closed"); n != 0 {
		t.Fatalf("drain miscounted: %d other closes", n)
	}
}

func TestHarborDrainRefusesNewStudios(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	go s.Drain(ctx)
	eventually(t, "draining", s.Draining)
	_, resp, err := dialPath(t, hs, "/relay/broadcast/a", nil)
	if err == nil || resp == nil || resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("err=%v resp=%v", err, resp)
	}
	if h.dials.Load() != 0 {
		t.Fatal("harbor dialled while draining")
	}
}

func TestBothPathsOnOneRelay(t *testing.T) {
	// Free (Icecast) and Pro (harbor) studios on the same copy at once.
	ice := newFakeIcecast(t, ok200)
	h := newFakeHarbor(t)
	cfg := harborConfig(h.addr())
	cfg.IcecastAddr = ice.ln.Addr().String()
	cfg.IdleTimeout = 5 * time.Second
	_, hs := startRelay(t, cfg)
	ctx := context.Background()

	free := dial(t, hs, nil) // the existing /relay address
	free.Write(ctx, websocket.MessageText, helloJSON("free-one", "t"))
	expectOK(t, free)
	pro := studio(t, hs, "pro-one")
	pro.Write(ctx, websocket.MessageText, helloJSON("pro-one", "t"))

	for i := 0; i < 20; i++ {
		free.Write(ctx, websocket.MessageBinary, []byte(fmt.Sprintf("F%02d", i)))
		pro.Write(ctx, websocket.MessageBinary, []byte(fmt.Sprintf("P%02d", i)))
	}
	eventually(t, "free audio at icecast", func() bool { return bytes.HasSuffix(ice.received(), []byte("F19")) })
	eventually(t, "pro audio at harbor", func() bool { return len(h.got("pro-one")) == 21 })
	if bytes.Contains(ice.received(), []byte("P0")) {
		t.Fatal("pro audio reached icecast")
	}
	for _, f := range h.got("pro-one") {
		if bytes.HasPrefix(f.data, []byte("F")) {
			t.Fatal("free audio reached harbor")
		}
	}
}

func TestManyHarborStationsStayApart(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	const n = 40
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			slug := fmt.Sprintf("st-%d", i)
			c := studio(t, hs, slug)
			ctx := context.Background()
			c.Write(ctx, websocket.MessageText, helloJSON(slug, "t"))
			for j := 0; j < 50; j++ {
				c.Write(ctx, websocket.MessageBinary, []byte(fmt.Sprintf("%s:%d", slug, j)))
			}
			eventually(t, slug, func() bool { return len(h.got(slug)) == 51 })
			for j, f := range h.got(slug)[1:] {
				if string(f.data) != fmt.Sprintf("%s:%d", slug, j) {
					t.Errorf("%s frame %d = %q", slug, j, f.data)
					return
				}
			}
			c.Close(websocket.StatusNormalClosure, "")
		}(i)
	}
	wg.Wait()
	eventually(t, "all closed", func() bool { return s.Active() == 0 })
}

func TestHarborTimeoutsFitTheStudio(t *testing.T) {
	d := DefaultConfig()
	// The studio gives a connect 10 s (SOCKET_CONNECT_TIMEOUT_MS).
	if d.HarborTimeout >= 10*time.Second {
		t.Fatalf("HarborTimeout %v must be under the studio's 10 s", d.HarborTimeout)
	}
	if d.HarborWriteTimeout < 5*time.Second {
		t.Fatalf("HarborWriteTimeout %v cuts stalls the studio rides out today", d.HarborWriteTimeout)
	}
}

func TestHarborDrainFreesTheMountEvenWithoutARecordedRelease(t *testing.T) {
	// Drain can catch a connection before holdsSource has run. Simulate it by
	// wiping the recorded release: harbor must still be let go at once.
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	ctx := context.Background()
	c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
	eventually(t, "connected", func() bool { return h.conn("a") != nil })
	s.mu.Lock()
	for k := range s.conns {
		s.conns[k] = nil
	}
	s.mu.Unlock()

	expired, cancel := context.WithTimeout(ctx, 0)
	defer cancel()
	start := time.Now()
	go s.Drain(expired)
	if got := readUntilClose(t, c); got != CloseDraining {
		t.Fatalf("close %d, want 1001", got)
	}
	h.waitEnd(t)
	eventually(t, "mount free", func() bool { return h.conn("a") == nil })
	if d := time.Since(start); d > time.Second {
		t.Fatalf("mount freed after %v", d)
	}
}

func TestHarborCloseMidAudioKeepsItsCode(t *testing.T) {
	// Harbor closes while the studio is mid-stream: a studio frame racing
	// the close must not turn harbor's 1011 into a bare drop.
	for i := 0; i < 30; i++ {
		h := newFakeHarbor(t)
		h.refuse = true
		h.refuseAt = 20
		_, hs := startRelay(t, harborConfig(h.addr()))
		c := studio(t, hs, "a")
		ctx := context.Background()
		c.Write(ctx, websocket.MessageText, helloJSON("a", "t"))
		go func() {
			for j := 0; j < 2000; j++ {
				if c.Write(ctx, websocket.MessageBinary, make([]byte, 400)) != nil {
					return
				}
			}
		}()
		rctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		_, _, err := c.Read(rctx)
		cancel()
		var ce websocket.CloseError
		if !errors.As(err, &ce) || ce.Code != websocket.StatusInternalError || ce.Reason != "Authentication failed." {
			t.Fatalf("run %d: studio got %v, want 1011 Authentication failed.", i, err)
		}
	}
}

func TestPlainRequestNeverDialsHarbor(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	resp, err := http.Get(hs.URL + "/relay/broadcast/a")
	if err != nil || resp.StatusCode != http.StatusUpgradeRequired {
		t.Fatalf("resp=%v err=%v, want 426", resp, err)
	}
	if h.dials.Load() != 0 {
		t.Fatal("harbor dialled for a plain GET")
	}
}
