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
//  5. Every PingInterval the relay pings the studio. Audio only flows one
//     way, and Cloudflare closes a WebSocket after 6010 s (100 min) with no
//     data from the origin towards the browser; the studio's uploads and its
//     pongs do not count. The ping is the only thing the relay sends after
//     ok, so it is what keeps a long show's socket open.
//
// The WebSocket itself is the relay's own (wsframe.go, wslink.go), so that a
// live connection can be handed to another relay process at any byte
// (handoff.go): that is how a relay copy moves to a new binary without any
// studio noticing.
package relay

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Close codes sent to the studio. 4001 is what the studio already treats as
// "rejected, don't retry"; everything else is a drop it may reconnect from.
const (
	CloseRejected     = 4001 // Icecast/API refused the login
	CloseBadHello     = 4002 // malformed or late hello
	CloseSourceKilled = 4005 // Icecast ended the source (admin killsource, restart)
	CloseBusy         = 4009 // someone already holds the mount
	CloseIcecastDown  = StatusInternalError
	CloseIdle         = StatusPolicyViolation
	CloseDraining     = StatusGoingAway
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
	BusyRetryFor   time.Duration // keep asking Icecast this long while it says "in use"
	BusyRetryEvery time.Duration // between those asks
	BusyRetryLogin time.Duration // the time each of those asks gets to answer
	WriteTimeout   time.Duration // one write to Icecast may block this long
	// One write to a Free studio (its "ok", a ping, a close) may block this
	// long before the studio counts as gone. Container studios use
	// HarborWriteTimeout, like the harbor side of their show.
	StudioWriteTimeout time.Duration
	MaxMessage         int64         // largest single WebSocket message accepted
	PingInterval       time.Duration // ping the studio this often; 0 = never

	// Harbor pass-through (harbor.go). Empty HarborAddr turns it off and
	// /broadcast/{slug} answers 404.
	HarborAddr         string        // station router, host:port, loopback
	HarborTimeout      time.Duration // dial + upgrade at the router
	HarborWriteTimeout time.Duration // one frame to harbor (or the studio) may block this long

	// How long a retiring copy keeps trying to hand its sessions to the
	// other copy: sessions still logging in (a Free studio's hello and
	// Icecast login) are handed over once they are live.
	HandoffWindow time.Duration
}

func DefaultConfig() Config {
	return Config{
		IcecastAddr:    "127.0.0.1:8000",
		IcecastHost:    "127.0.0.1",
		MountPrefix:    "/stream/",
		HelloTimeout:   10 * time.Second,
		IcecastTimeout: 10 * time.Second,
		// How long a studio may send nothing before the relay gives its
		// station up. Long enough to ride out a stall the studio recovers
		// from on the same connection (a Wi-Fi hiccup, a busy tab, the
		// studio rebuilding a frozen audio engine at 5 s): cutting sooner
		// turns each into a disconnect and a reconnect. A studio that does
		// reconnect does not wait for it: its token request has Laravel cut
		// the dead source it left behind (RelaySourceHolder). Under
		// Icecast's <source-timeout> (10 s), which would otherwise drop the
		// source first and tell the studio 4005 "source ended" instead of
		// 1008 "no audio".
		IdleTimeout:  8 * time.Second,
		WriteTimeout: 5 * time.Second,
		// A studio that has read nothing for this long has stopped reading:
		// pings are a few bytes every 30 s, so only a dead tab fills the
		// socket.
		StudioWriteTimeout: 10 * time.Second,
		MaxMessage:         64 << 10,
		PingInterval:       30 * time.Second,
		// The router answers an upgrade in milliseconds; a station that is
		// off is a quick 502. Under the studio's 10 s connect timeout.
		HarborTimeout: 5 * time.Second,
		// Longer than the Icecast write limit: without the relay a studio
		// rides out a slow harbor on its own send buffer, so cutting a
		// stall short would be the relay's doing. Harbor's own 10 s input
		// timeout ends a really stuck show either way.
		HarborWriteTimeout: 10 * time.Second,
		// Over the longest a Free studio can take to go live: hello (10 s),
		// then the Icecast login and its busy retries (10 s at most).
		HandoffWindow: 30 * time.Second,
		// Icecast frees a cut source a moment after the cut, and the studio's
		// reconnect can arrive inside that moment. Asking again briefly rides
		// it out; a station really in use still gets 4009, a second later.
		// Each ask is a full source login, which Icecast checks with Laravel,
		// so this stays short.
		BusyRetryFor:   1 * time.Second,
		BusyRetryEvery: 250 * time.Millisecond,
		// A login is Icecast asking Laravel, usually tens of ms. 3 s lets a
		// slow one finish, and keeps the worst case (1 s of asking, then a
		// 3 s login) well inside the studio's 12 s wait for "ok".
		BusyRetryLogin: 3 * time.Second,
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

// Server is an http.Handler for the WebSocket endpoints.
type Server struct {
	cfg     Config
	Metrics *Metrics
	Logf    func(format string, args ...any)

	mu         sync.Mutex
	conns      map[*session]*conn
	draining   bool
	retiring   bool
	handingOff bool // RetireVia is moving sessions to the other copy right now
	// Closed and replaced each time a session leaves: what a retirement
	// waiting for its last container show waits on.
	left chan struct{}

	handoffUp atomic.Bool // the hand-off socket is accepting
	wg        sync.WaitGroup
}

// Which path a studio came in on; a label on the metrics.
const (
	PathIcecast = "icecast" // Free: /relay → Icecast
	PathHarbor  = "harbor"  // container: /relay/broadcast/{slug} → harbor
)

// conn is one studio connection as Drain and Retire see it.
type conn struct {
	path    string
	sess    *session
	release func() // lets go of the Icecast source or harbor; nil until held

	// Set when the relay itself closes this studio for a restart.
	kicked atomic.Bool
}

func New(cfg Config) *Server {
	return &Server{cfg: cfg, Metrics: NewMetrics(), Logf: log.Printf, conns: map[*session]*conn{}, left: make(chan struct{})}
}

func (s *Server) track(ss *session, path string) (*conn, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.draining {
		return nil, false
	}
	st := &conn{path: path, sess: ss}
	ss.track = st
	s.conns[ss] = st
	s.wg.Add(1)
	return st, true
}

// holdsSource records how to give up this studio's source (Icecast) or
// harbor connection, so a drain can free the mount before it closes the
// socket.
func (s *Server) holdsSource(ss *session, release func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if st, ok := s.conns[ss]; ok {
		st.release = release
	}
}

func (s *Server) untrack(ss *session) {
	s.mu.Lock()
	delete(s.conns, ss)
	close(s.left)
	s.left = make(chan struct{})
	s.mu.Unlock()
	s.wg.Done()
}

// harborLeft is how many container shows are on this copy, and a channel
// closed as soon as any session leaves.
func (s *Server) harborLeft() (int, <-chan struct{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, st := range s.conns {
		if st.path == PathHarbor {
			n++
		}
	}
	return n, s.left
}

// finish accounts for a session that ended on this copy. One handed to the
// other copy ("") was accounted for at the hand-off (handedOff).
func (s *Server) finish(ss *session, label string) {
	if label == "" {
		return
	}
	s.untrack(ss)
	s.Metrics.connClosed(ss.path)
	s.Metrics.Close(label)
}

// handedOff takes a session off this copy's books the moment the other copy
// has it, so Active, /healthz and a retirement's count never include it.
func (s *Server) handedOff(ss *session) {
	s.untrack(ss)
	s.Metrics.connClosed(ss.path)
	s.Metrics.handoffOut(ss.path)
}

// kicked is one studio a drain or retire is about to hand over, with its
// release as it stood under s.mu.
type kicked struct {
	st      *conn
	release func()
}

// kickAll hands studios over, outside s.mu (closing sockets under the lock
// would let one slow close hold up /healthz and every other caller), and all
// at once: a close can take closeWait on a studio that stopped reading, and
// one by one a few of those would use up systemd's 10 s stop window, the
// studios behind them killed without ever hearing 1001.
func kickAll(list []kicked) {
	for _, k := range list {
		go k.st.sess.kick(k.release)
	}
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
	// Everyone at once, outside the lock. A close waits up to 5 s for the
	// studio's reply; one by one, two silent peers (a phone in a tunnel) used
	// up systemd's 10 s stop budget and the studios behind them were killed
	// without ever hearing "reconnect now". In parallel the slowest peer
	// bounds the whole drain.
	//
	// Each studio's Icecast source or harbor is released first: the close
	// handshake can take seconds, and a studio reconnecting through the
	// other copy in the meantime would find its mount still held.
	s.mu.Lock()
	list := make([]kicked, 0, len(s.conns))
	for _, st := range s.conns {
		list = append(list, kicked{st, st.release})
	}
	s.mu.Unlock()
	kickAll(list)
	<-done
}

// retire hands this copy over without cutting a live container show, the
// way it was done before hand-offs (and still is when the other copy cannot
// take them): new studios are refused (nginx sends them to the other copy),
// Free studios are handed over at once (Icecast's fallback covers their
// listeners), container shows are left to end on their own, for up to
// maxWait.
func (s *Server) retire(maxWait time.Duration) { s.RetireVia(maxWait, nil) }

// RetireVia retires this copy, moving every live session to the copy at `to`
// first (handoff.go): nobody notices anything. Whatever could not be moved
// (no target, the target refused or failed, a session that never went live
// in time) is retired the old way, as retire describes. Returns when every
// studio is gone; the caller exits and systemd starts the new binary.
//
// A second call (a manual SIGUSR1 racing the automatic rollover) does not
// start a second retirement: it waits for the first to finish.
func (s *Server) RetireVia(maxWait time.Duration, to *HandoffTarget) {
	s.mu.Lock()
	if s.retiring {
		s.mu.Unlock()
		s.wg.Wait()
		return
	}
	s.draining = true
	s.retiring = true
	// With retiring, under the same lock: the deploy must never see this
	// copy retiring with shows on and not handing off while it is about to.
	s.handingOff = to != nil
	s.mu.Unlock()

	if to != nil {
		s.handOffAll(*to)
		s.setHandingOff(false)
	}

	s.mu.Lock()
	var free []kicked
	for _, st := range s.conns {
		if st.path != PathHarbor {
			free = append(free, kicked{st, st.release})
		}
	}
	s.mu.Unlock()
	kickAll(free)

	limit := time.NewTimer(maxWait)
	defer limit.Stop()
wait:
	for {
		n, left := s.harborLeft()
		if n == 0 {
			break
		}
		select {
		case <-left:
		case <-limit.C:
			break wait
		}
	}
	expired, cancel := context.WithTimeout(context.Background(), 0)
	defer cancel()
	s.Drain(expired)
}

// ActiveOn counts the studios on one path.
func (s *Server) ActiveOn(path string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, st := range s.conns {
		if st.path == path {
			n++
		}
	}
	return n
}

func (s *Server) setHandingOff(v bool) {
	s.mu.Lock()
	s.handingOff = v
	s.mu.Unlock()
}

// HandingOff reports whether a retirement is moving sessions to the other
// copy right now. Whatever is still here then is on its way out in seconds;
// once it is false, what a retiring copy still carries stays until it ends.
func (s *Server) HandingOff() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.handingOff
}

// Retiring reports whether Retire has been called.
func (s *Server) Retiring() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.retiring
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
	if slug, ok := HarborSlug(r.URL.Path); ok && s.cfg.HarborAddr != "" {
		s.serveHarbor(w, r, slug)
		return
	} else if ok || strings.Contains(r.URL.Path, "/broadcast/") {
		// Pass-through off, or a malformed pass-through address. Either way
		// not the Icecast path: that one speaks another protocol (it answers
		// {"type":"ok"} and logs in to Icecast), and a container studio sent
		// there would be refused with a misleading code.
		http.NotFound(w, r)
		return
	}
	if e := checkUpgrade(r); e != nil {
		http.Error(w, e.msg, e.status)
		s.Metrics.Close("refused_upgrade")
		return
	}
	if !originAllowed(r, s.cfg.OriginPatterns) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		s.Metrics.Close("refused_upgrade")
		return
	}
	proto := selectSubprotocol(r, []string{"webcast"})
	studio, err := acceptUpgrade(w, r, proto, s.cfg.MaxMessage, s.cfg.StudioWriteTimeout)
	if err != nil {
		s.Metrics.Close("refused_upgrade")
		return
	}
	if proto != "webcast" {
		studio.closeAndWait(StatusPolicyViolation, "webcast subprotocol required")
		s.Metrics.Close("no_subprotocol")
		return
	}
	ss := newSession(s, PathIcecast, studio)
	if _, ok := s.track(ss, PathIcecast); !ok {
		studio.closeAndWait(CloseDraining, "relay restarting")
		s.Metrics.Close("draining")
		return
	}
	s.Metrics.connOpened(PathIcecast)
	s.finish(ss, ss.runIcecast())
}

var errPeerClosed = errors.New("peer closed")

// readSetupMessage reads one whole message before the session is live (the
// hello), answering pings meanwhile.
func (ss *session) readSetupMessage() (byte, []byte, error) {
	c := ss.studio
	var op byte
	var msg []byte
	for {
		f, err := c.readFrame()
		if err != nil {
			return 0, nil, err
		}
		switch f.op {
		case opPing:
			c.writeFrame(true, opPong, f.payload)
			continue
		case opPong:
			continue
		case opClose:
			c.answerClose(f.payload) // or, after a kick, takes its answer
			return 0, nil, errPeerClosed
		}
		if f.op != opContinuation {
			op = f.op
		}
		msg = append(msg, f.payload...)
		if f.fin {
			return op, msg, nil
		}
	}
}

func (ss *session) endLabel() string {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return ss.label
}

// runIcecast runs one Free studio: hello, Icecast login, ok, then the show.
// Returns why it ended (a metrics label), or "" if it was handed off.
func (ss *session) runIcecast() string {
	s, c := ss.srv, ss.studio

	// 1. The hello.
	c.nc.SetReadDeadline(time.Now().Add(s.cfg.HelloTimeout))
	op, msg, err := ss.readSetupMessage()
	c.nc.SetReadDeadline(time.Time{})
	if ss.ending() { // a drain's kick came during the hello
		c.closeNow()
		return ss.endLabel()
	}
	if err != nil {
		if code, why := closeCodeFor(err, s.cfg.MaxMessage); code != 0 {
			c.writeClose(code, why)
		}
		c.closeNow()
		return "no_hello"
	}
	if op != opText {
		c.closeAndWait(CloseBadHello, "expected hello")
		return "bad_hello"
	}
	slug, token, err := ParseHello(msg)
	if err != nil {
		c.closeAndWait(CloseBadHello, err.Error())
		return "bad_hello"
	}
	ss.id = slug + "-" + ss.id

	// 2. Icecast.
	ice, code, why := s.openSourceWhenFree(ss.ctx, slug, token)
	if ice == nil {
		if ss.ending() { // kicked during the login: already told 1001
			return ss.endLabel()
		}
		c.closeAndWait(code, why)
		return labelFor(code)
	}
	l := newLink(ice, s.cfg.WriteTimeout)

	// 3. ok, and live. Under ss.mu so a kick cannot slip its 1001 in
	// between "ok" and the session going live.
	ss.mu.Lock()
	if ss.state != stSetup {
		ss.mu.Unlock()
		l.closeNow()
		return ss.endLabel()
	}
	ss.ice = &l
	if err := c.writeFrame(true, opText, []byte(`{"type":"ok"}`)); err != nil {
		ss.state, ss.label = stEnding, "client_gone"
		ss.mu.Unlock()
		l.closeNow()
		c.closeNow()
		return "client_gone"
	}
	now := time.Now()
	ss.lastAudio.Store(now.UnixNano())
	ss.nextPing.Store(now.Add(s.cfg.PingInterval).UnixNano())
	ss.goLiveLocked(ss.icecastStudioReader, ss.iceWatcher)
	ss.mu.Unlock()
	s.holdsSource(ss, l.closeNow)

	// 4. The show, here or (after a hand-off) on the other copy.
	return ss.wait()
}

// icecastStudioReader: the studio's binary frames go to Icecast untouched.
// Text frames after the hello (metadata) are not Icecast's and are dropped.
func (ss *session) icecastStudioReader() {
	c := ss.studio
	for {
		f, err := c.readFrame()
		if err != nil {
			if handled, exit := ss.park(err); handled {
				if exit {
					return
				}
				continue
			}
			ss.studioReadFailed(err)
			return
		}
		if ss.ending() {
			if f.op == opClose { // the answer to the relay's own close
				c.closeNow()
				return
			}
			continue
		}
		switch f.op {
		case opPing:
			if err := c.writeFrame(true, opPong, f.payload); err != nil {
				ss.studioWriteFailed(err)
			}
			continue
		case opPong:
			continue
		case opClose:
			ss.studioClosed(f.payload)
			return
		}
		if f.msgOp != opBinary {
			continue
		}
		ss.lastAudio.Store(time.Now().UnixNano())
		if err := ss.ice.write(f.payload); err != nil {
			ss.iceWriteFailed(err)
			continue // the studio's close reply still comes this way
		}
		ss.srv.Metrics.bytesIn(PathIcecast, len(f.payload))
	}
}

// iceWatcher: Icecast sends nothing after its answer, so a read returning
// means it closed the source (killsource, restart, source-timeout).
func (ss *session) iceWatcher() {
	buf := make([]byte, 512)
	for {
		_, err := ss.ice.nc.Read(buf)
		if err == nil {
			continue
		}
		if handled, exit := ss.park(err); handled {
			if exit {
				return
			}
			continue
		}
		ss.end("icecast_closed", func() {
			ss.ice.closeNow()
			ss.studio.closeHandshake(CloseSourceKilled, "source ended by server")
		})
		return
	}
}

// iceWriteFailed: Icecast refused audio (stalled for WriteTimeout, or its
// socket broke). The studio is told 4005 so it knows to reconnect.
func (ss *session) iceWriteFailed(err error) {
	ss.end("icecast_write", func() {
		ss.ice.closeNow()
		ss.studio.closeHandshake(CloseSourceKilled, "stream server stopped accepting audio")
	})
}

// closeCodeFor is the close a read error is answered with: 1009 for a
// message over the limit, 1002 for a protocol violation, 0 (just drop the
// socket) for a connection that broke.
func closeCodeFor(err error, maxMessage int64) (int, string) {
	var pe *protoError
	switch {
	case errors.Is(err, errTooBig):
		return StatusMessageTooBig, fmt.Sprintf("read limited at %d bytes", maxMessage)
	case errors.As(err, &pe):
		return StatusProtocolError, pe.why
	}
	return 0, ""
}

// closeUpstream lets go of Icecast or harbor at once.
func (ss *session) closeUpstream() {
	ss.mu.Lock()
	ice, up := ss.ice, ss.up
	ss.mu.Unlock()
	if ice != nil {
		ice.closeNow()
	}
	if up != nil {
		up.closeNow()
	}
}

// studioReadFailed: the studio's socket broke, or it sent something the
// relay cannot take (1009 too big, 1002 protocol error).
func (ss *session) studioReadFailed(err error) {
	c := ss.studio
	if ss.ending() { // the relay closed it, or it left after the relay's close
		c.closeNow()
		return
	}
	code, why := closeCodeFor(err, ss.srv.cfg.MaxMessage)
	label := "client_closed"
	switch code {
	case StatusMessageTooBig:
		label = "too_big"
	case StatusProtocolError:
		label = "bad_frame"
	}
	if !ss.end(ss.reason(label), func() {
		ss.closeUpstream()
		if code != 0 {
			c.writeClose(code, why)
		}
		c.closeNow()
	}) {
		c.closeNow()
	}
}

// studioClosed: the studio sent close. It gets its close back; Icecast is
// let go, or harbor is closed with the studio's own code.
func (ss *session) studioClosed(payload []byte) {
	c := ss.studio
	code, reason, err := parseClose(payload)
	if err != nil {
		ss.studioReadFailed(err)
		return
	}
	if !ss.end(ss.reason("client_closed"), func() {
		c.answerClose(payload)
		if ss.path == PathHarbor {
			forwardClose(ss.up, code, reason)
		} else {
			ss.ice.closeNow()
		}
	}) {
		c.closeNow()
	}
}

// openSourceWhenFree is openSource, asked again while Icecast says the mount
// is in use, for up to BusyRetryFor. The usual holder is the studio's own
// previous connection, which Laravel has just cut and Icecast has not quite
// let go of yet.
//
// BusyRetryFor bounds when a retry may start. Each retry then gets a whole
// BusyRetryLogin to answer: a login cut short could be one Icecast was about
// to admit, reported as "already live" while Icecast briefly held a source
// the relay had already hung up on. A retry that gets no answer in that time
// reports what happened (Icecast not answering), and the asking stops.
func (s *Server) openSourceWhenFree(ctx context.Context, slug, token string) (net.Conn, int, string) {
	deadline := time.Now().Add(s.cfg.BusyRetryFor)
	ice, code, why := s.openSource(ctx, slug, token, s.cfg.IcecastTimeout)
	for code == CloseBusy {
		if !time.Now().Add(s.cfg.BusyRetryEvery).Before(deadline) {
			return ice, code, why
		}
		select {
		case <-ctx.Done():
			return ice, code, why
		case <-time.After(s.cfg.BusyRetryEvery):
		}
		s.Metrics.busyRetry()
		ice, code, why = s.openSource(ctx, slug, token, s.cfg.BusyRetryLogin)
	}
	return ice, code, why
}

// openSource dials Icecast and logs in. On failure it returns the close code
// and reason to send the studio.
func (s *Server) openSource(ctx context.Context, slug, token string, timeout time.Duration) (net.Conn, int, string) {
	d := net.Dialer{Timeout: timeout}
	ice, err := d.DialContext(ctx, "tcp", s.cfg.IcecastAddr)
	if err != nil {
		return nil, CloseIcecastDown, "stream server unavailable"
	}
	ice.SetDeadline(time.Now().Add(timeout))
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

func labelFor(c int) string {
	switch c {
	case CloseRejected:
		return "rejected"
	case CloseBusy:
		return "busy"
	default:
		return "icecast_down"
	}
}
