// Package relay pipes a browser studio's WebSocket audio into an Icecast
// source connection, byte for byte.
//
// One connection, start to finish:
//
//  1. The studio opens a WebSocket (subprotocol "webcast") and sends one text
//     frame, the same hello Liquidsoap's harbor reads today:
//     {"type":"hello","data":{"mime":"audio/mpeg","user":"<slug>","password":"<token>"}}
//  2. The relay checks the shape of that hello, dials Icecast and writes the
//     PUT request itself, so a browser can never send Icecast arbitrary HTTP.
//     Icecast asks the API whether slug+token may publish; the relay never
//     talks to the API.
//  3. Once Icecast accepts (it answers the PUT's Expect: 100-continue only after
//     the API said yes) the studio gets {"type":"ok"}; on a refusal the socket
//     closes with a code the studio can act on (see Close* below).
//  4. Binary frames are written to Icecast untouched. Text frames after the
//     hello are ignored. When either side ends, both are closed.
package relay

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

// Close codes sent to the studio. 4001 is what the studio already treats as
// "rejected, don't retry"; everything else is a drop it may reconnect from.
const (
	CloseRejected     websocket.StatusCode = 4001 // Icecast/API refused the login
	CloseBadHello     websocket.StatusCode = 4002 // malformed or late hello
	CloseSourceKilled websocket.StatusCode = 4005 // Icecast ended the source (admin killsource, restart)
	CloseBusy         websocket.StatusCode = 4009 // someone already holds the mount
	CloseIcecastDown                       = websocket.StatusInternalError
	CloseIdle                              = websocket.StatusPolicyViolation
	CloseDraining                          = websocket.StatusGoingAway
)

// How long a refusal's reason may trail its headers before the relay closes
// without it. Icecast writes both at once, so anything longer is a peer that
// will not send one.
const refusalBodyWait = 300 * time.Millisecond

type Config struct {
	IcecastAddr    string        // host:port, loopback
	IcecastHost    string        // Host header for the PUT
	MountPrefix    string        // "/stream/"
	OriginPatterns []string      // allowed Origin hosts, e.g. "gocast.fm", "localhost:18080"
	HelloTimeout   time.Duration // studio must send its hello within this
	IcecastTimeout time.Duration // dial + Icecast's answer (it waits on the API)
	IdleTimeout    time.Duration // no frame from the studio for this long = dead
	WriteTimeout   time.Duration // one write to Icecast may block this long
	MaxMessage     int64         // largest single WebSocket message accepted
}

func DefaultConfig() Config {
	return Config{
		IcecastAddr:    "127.0.0.1:8000",
		IcecastHost:    "127.0.0.1",
		MountPrefix:    "/stream/",
		HelloTimeout:   10 * time.Second,
		IcecastTimeout: 10 * time.Second,
		IdleTimeout:    15 * time.Second,
		WriteTimeout:   5 * time.Second,
		MaxMessage:     64 << 10,
	}
}

var slugRe = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)

type hello struct {
	Type string `json:"type"`
	Data struct {
		Mime     string `json:"mime"`
		User     string `json:"user"`
		Password string `json:"password"`
	} `json:"data"`
}

// ParseHello validates the studio's first frame and returns slug and token.
func ParseHello(b []byte) (slug, token string, err error) {
	var h hello
	if err := json.Unmarshal(b, &h); err != nil {
		return "", "", errors.New("hello is not JSON")
	}
	if h.Type != "hello" {
		return "", "", errors.New("first frame is not a hello")
	}
	if h.Data.Mime != "audio/mpeg" {
		return "", "", errors.New("unsupported mime")
	}
	if !slugRe.MatchString(h.Data.User) {
		return "", "", errors.New("bad station")
	}
	t := h.Data.Password
	if len(t) == 0 || len(t) > 512 {
		return "", "", errors.New("bad token")
	}
	for i := 0; i < len(t); i++ {
		if t[i] < 0x21 || t[i] > 0x7e {
			return "", "", errors.New("bad token")
		}
	}
	return h.Data.User, t, nil
}

// SourceRequest is the exact request the relay sends Icecast.
func SourceRequest(cfg Config, slug, token string) string {
	auth := base64.StdEncoding.EncodeToString([]byte(slug + ":" + token))
	return "PUT " + cfg.MountPrefix + slug + " HTTP/1.1\r\n" +
		"Host: " + cfg.IcecastHost + "\r\n" +
		"Authorization: Basic " + auth + "\r\n" +
		"Content-Type: audio/mpeg\r\n" +
		"Ice-Public: 0\r\n" +
		"User-Agent: gocast-relay/1\r\n" +
		// Without this Icecast 2.5 answers nothing on success and waits for
		// audio, while the relay waits for an answer before sending any.
		// With it, Icecast replies "100 Continue" once the login is accepted.
		"Expect: 100-continue\r\n" +
		"\r\n"
}

// Server is an http.Handler for the WebSocket endpoint.
type Server struct {
	cfg     Config
	Metrics *Metrics

	mu       sync.Mutex
	conns    map[*websocket.Conn]struct{}
	draining bool
	wg       sync.WaitGroup
}

func New(cfg Config) *Server {
	return &Server{cfg: cfg, Metrics: NewMetrics(), conns: map[*websocket.Conn]struct{}{}}
}

func (s *Server) track(c *websocket.Conn) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.draining {
		return false
	}
	s.conns[c] = struct{}{}
	s.wg.Add(1)
	return true
}

func (s *Server) untrack(c *websocket.Conn) {
	s.mu.Lock()
	delete(s.conns, c)
	s.mu.Unlock()
	s.wg.Done()
}

// Drain refuses new connections and waits for the current ones to finish on
// their own. When ctx ends first, the rest are closed with 1001 so their
// studios reconnect elsewhere.
func (s *Server) Drain(ctx context.Context) {
	s.mu.Lock()
	s.draining = true
	s.mu.Unlock()

	done := make(chan struct{})
	go func() { s.wg.Wait(); close(done) }()
	select {
	case <-done:
		return
	case <-ctx.Done():
	}
	// Everyone at once, outside the lock. Close waits up to 5 s for the
	// studio's reply; one by one, two silent peers (a phone in a tunnel) used
	// up systemd's 10 s stop budget and the studios behind them were killed
	// without ever hearing "reconnect now". In parallel the slowest peer
	// bounds the whole drain.
	s.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(s.conns))
	for c := range s.conns {
		conns = append(conns, c)
	}
	s.mu.Unlock()
	for _, c := range conns {
		go c.Close(CloseDraining, "relay restarting")
	}
	<-done
}

func (s *Server) Active() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.conns)
}

func (s *Server) Draining() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.draining
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.Draining() {
		http.Error(w, "draining", http.StatusServiceUnavailable)
		return
	}
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols:    []string{"webcast"},
		OriginPatterns:  s.cfg.OriginPatterns,
		CompressionMode: websocket.CompressionDisabled, // MP3 doesn't compress
	})
	if err != nil {
		s.Metrics.Close("refused_upgrade")
		return
	}
	if ws.Subprotocol() != "webcast" {
		ws.Close(websocket.StatusPolicyViolation, "webcast subprotocol required")
		s.Metrics.Close("no_subprotocol")
		return
	}
	if !s.track(ws) {
		ws.Close(CloseDraining, "relay restarting")
		return
	}
	defer s.untrack(ws)
	ws.SetReadLimit(s.cfg.MaxMessage)

	s.Metrics.connOpened()
	reason := s.serve(r.Context(), ws)
	s.Metrics.connClosed()
	s.Metrics.Close(reason)
}

// serve runs one studio connection and returns why it ended (a metrics label).
func (s *Server) serve(parent context.Context, ws *websocket.Conn) string {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	// 1. The hello.
	hctx, hcancel := context.WithTimeout(ctx, s.cfg.HelloTimeout)
	typ, msg, err := ws.Read(hctx)
	hcancel()
	if err != nil {
		ws.CloseNow()
		return "no_hello"
	}
	if typ != websocket.MessageText {
		ws.Close(CloseBadHello, "expected hello")
		return "bad_hello"
	}
	slug, token, err := ParseHello(msg)
	if err != nil {
		ws.Close(CloseBadHello, err.Error())
		return "bad_hello"
	}

	// 2. Icecast.
	ice, code, why := s.openSource(ctx, slug, token)
	if ice == nil {
		ws.Close(code, why)
		return labelFor(code)
	}
	defer ice.Close()

	if err := ws.Write(ctx, websocket.MessageText, []byte(`{"type":"ok"}`)); err != nil {
		ws.CloseNow()
		return "client_gone"
	}

	// 3. Icecast never sends anything after its answer; a read returning
	// means it closed the source (killsource, restart, source-timeout).
	// Close the socket from here rather than cancelling the read below:
	// websocket.Read drops the connection without a close code when its
	// context is cancelled, and the studio needs 4005 to know why.
	var idle atomic.Bool
	iceClosed := make(chan struct{})
	go func() {
		io.Copy(io.Discard, ice)
		close(iceClosed)
		if !idle.Load() {
			ws.Close(CloseSourceKilled, "source ended by server")
		}
	}()

	// 4. Pipe. The idle limit is a timer that closes the socket, not a
	// deadline on the read, for the same reason as above: a read whose
	// context expires drops the connection with no close code, and the
	// studio's drop report would read 1006 instead of 1008. The source is
	// released at once: the close handshake can wait seconds on a studio
	// whose network is gone, and its reconnect needs the mount free.
	idleTimer := time.AfterFunc(s.cfg.IdleTimeout, func() {
		idle.Store(true)
		ice.Close()
		ws.Close(CloseIdle, "no audio")
	})
	defer idleTimer.Stop()
	for {
		typ, data, err := ws.Read(ctx)
		if err != nil {
			if idle.Load() {
				return "idle"
			}
			select {
			case <-iceClosed:
				return "icecast_closed"
			default:
			}
			var ce websocket.CloseError
			if errors.As(err, &ce) && ce.Code == websocket.StatusMessageTooBig {
				return "too_big"
			}
			if websocket.CloseStatus(err) == -1 && errors.Is(err, context.Canceled) {
				// cancelled from elsewhere (drain closes the socket itself)
				return "cancelled"
			}
			return "client_closed"
		}
		if typ != websocket.MessageBinary {
			continue
		}
		// A frame that was already on its way when the idle timer fired: the
		// source is closed, and writing to it would report the studio's stall
		// as Icecast refusing audio.
		if idle.Load() {
			return "idle"
		}
		idleTimer.Reset(s.cfg.IdleTimeout)
		ice.SetWriteDeadline(time.Now().Add(s.cfg.WriteTimeout))
		if _, err := ice.Write(data); err != nil {
			ws.Close(CloseSourceKilled, "stream server stopped accepting audio")
			return "icecast_write"
		}
		s.Metrics.bytesIn(len(data))
	}
}

// openSource dials Icecast and logs in. On failure it returns the close code
// and reason to send the studio.
func (s *Server) openSource(ctx context.Context, slug, token string) (net.Conn, websocket.StatusCode, string) {
	d := net.Dialer{Timeout: s.cfg.IcecastTimeout}
	ice, err := d.DialContext(ctx, "tcp", s.cfg.IcecastAddr)
	if err != nil {
		return nil, CloseIcecastDown, "stream server unavailable"
	}
	ice.SetDeadline(time.Now().Add(s.cfg.IcecastTimeout))
	if _, err := io.WriteString(ice, SourceRequest(s.cfg, slug, token)); err != nil {
		ice.Close()
		return nil, CloseIcecastDown, "stream server unavailable"
	}
	br := bufio.NewReader(ice)
	status, err := br.ReadString('\n')
	if err != nil {
		ice.Close()
		return nil, CloseIcecastDown, "stream server did not answer"
	}
	// Headers, then (on errors) a short body that carries Icecast's reason.
	var rest strings.Builder
	for {
		line, err := br.ReadString('\n')
		rest.WriteString(line)
		if err != nil || line == "\r\n" || line == "\n" {
			break
		}
	}
	code := statusCode(status)
	if code == 100 || code == 200 {
		ice.SetDeadline(time.Time{})
		return ice, 0, ""
	}
	// The reason, if any, comes in the same write as the headers. Icecast 2.5
	// always sends one and hangs up, but a refusal must not sit out the whole
	// IcecastTimeout waiting for a body that is never coming: the studio gives
	// up at 12 s and would report a timeout instead of the refusal.
	ice.SetReadDeadline(time.Now().Add(refusalBodyWait))
	body := make([]byte, 512)
	n, _ := io.ReadAtLeast(br, body, 1)
	ice.Close()
	text := strings.ToLower(status + rest.String() + string(body[:n]))
	switch {
	case strings.Contains(text, "in use"):
		return nil, CloseBusy, "station is already live"
	case code == 401 || code == 403:
		return nil, CloseRejected, "broadcast refused"
	default:
		return nil, CloseIcecastDown, fmt.Sprintf("stream server answered %d", code)
	}
}

func statusCode(line string) int {
	var proto string
	var code int
	fmt.Sscanf(line, "%s %d", &proto, &code)
	return code
}

func labelFor(c websocket.StatusCode) string {
	switch c {
	case CloseRejected:
		return "rejected"
	case CloseBusy:
		return "busy"
	default:
		return "icecast_down"
	}
}
