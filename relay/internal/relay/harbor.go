package relay

// Harbor pass-through: the container (Pro) path through the relay.
//
// A Pro studio talks to its station's Liquidsoap harbor, through the station
// router, with the webcast protocol. Harbor sends nothing back once a show is
// running, so Cloudflare closes the studio's socket after 6010 s, the same
// cut the Icecast path above fixed with pings. Here the relay sits in the
// middle and adds only those pings:
//
//	studio ──wss──▶ nginx /relay/broadcast/{slug} ─▶ relay ──ws──▶ router :8091 /broadcast/{slug} ─▶ harbor
//
// Everything else is harbor's, exactly as without the relay: the hello and
// its token check (harbor asks Laravel), the audio, the studio's `metadata`
// frames, and every close and its code. The relay reads none of it. In
// particular it never answers {"type":"ok"}: a container studio does not wait
// for one, it treats "harbor kept the socket for 600 ms" as accepted.
//
// Harbor is dialled before the studio's upgrade is accepted, so a station
// whose container is down fails the upgrade with the router's own status, as
// it does when the studio dials the router directly.

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

// The public path, with or without nginx's /relay prefix. The slug charset is
// the station router's (and Str::slug's): this is the only thing the relay
// puts into the URL it dials.
var harborPathRe = regexp.MustCompile(`^(?:/relay)?/broadcast/([a-z0-9][a-z0-9-]{0,62})$`)

// HarborSlug returns the station slug when path is a pass-through address.
func HarborSlug(p string) (string, bool) {
	m := harborPathRe.FindStringSubmatch(p)
	if m == nil {
		return "", false
	}
	return m[1], true
}

// CloseHarborWrite is sent to the studio when harbor stops taking audio.
const CloseHarborWrite = websocket.StatusInternalError

// serveHarbor runs one studio's pass-through and records why it ended.
func (s *Server) serveHarbor(w http.ResponseWriter, r *http.Request, slug string) {
	// Not an upgrade at all: refuse before spending a dial on harbor.
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "WebSocket upgrade required", http.StatusUpgradeRequired)
		s.Metrics.Close("refused_upgrade")
		return
	}
	if !originAllowed(r, s.cfg.OriginPatterns) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		s.Metrics.Close("harbor_refused_origin")
		return
	}

	up, status := s.dialHarbor(r, slug)
	if up == nil {
		http.Error(w, "stream server unavailable", status)
		s.Metrics.Close("harbor_unreachable")
		return
	}
	// A drain or retire that began during the dial: refuse the upgrade, so
	// nginx retries the other copy, rather than accept and close with 1001.
	if s.Draining() {
		up.CloseNow()
		http.Error(w, "draining", http.StatusServiceUnavailable)
		s.Metrics.Close("harbor_draining")
		return
	}

	// Offer the studio whatever harbor chose, so the studio sees the same
	// handshake it would have seen from the router.
	var protos []string
	if p := up.Subprotocol(); p != "" {
		protos = []string{p}
	}
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols:    protos,
		OriginPatterns:  s.cfg.OriginPatterns,
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		up.CloseNow()
		s.Metrics.Close("refused_upgrade")
		return
	}
	st, ok := s.track(ws, PathHarbor)
	if !ok {
		// The few microseconds between the check above and here.
		up.CloseNow()
		ws.Close(CloseDraining, "relay restarting")
		s.Metrics.Close("harbor_draining")
		return
	}
	defer s.untrack(ws)
	ws.SetReadLimit(s.cfg.MaxMessage)
	up.SetReadLimit(s.cfg.MaxMessage)
	// A drain lets go of harbor first, so the studio's reconnect through the
	// other copy finds the mount free instead of "source already connected".
	s.holdsSource(ws, func() { up.CloseNow() })

	s.Metrics.connOpened(PathHarbor)
	reason := s.pipeHarbor(r.Context(), ws, up, st)
	s.Metrics.connClosed(PathHarbor)
	s.Metrics.Close(reason)
}

// dialHarbor opens the relay's own socket to the station router. On failure
// it returns the HTTP status to refuse the studio's upgrade with: the
// router's own answer when there was one (502 for a station that is off).
func (s *Server) dialHarbor(r *http.Request, slug string) (*websocket.Conn, int) {
	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.HarborTimeout)
	defer cancel()

	h := http.Header{}
	// The router overwrites X-Real-IP with its own peer, but pass on what
	// nginx told us so the chain still carries the broadcaster's address.
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		h.Set("X-Forwarded-For", v)
	}
	if v := r.Header.Get("X-Real-IP"); v != "" {
		h.Set("X-Real-IP", v)
	}
	if v := r.Header.Get("User-Agent"); v != "" {
		h.Set("User-Agent", v)
	}
	var protos []string
	if p := r.Header.Get("Sec-WebSocket-Protocol"); p != "" {
		for _, v := range strings.Split(p, ",") {
			if v = strings.TrimSpace(v); v != "" {
				protos = append(protos, v)
			}
		}
	}

	u := "ws://" + s.cfg.HarborAddr + "/broadcast/" + slug
	up, resp, err := websocket.Dial(ctx, u, &websocket.DialOptions{
		Subprotocols:    protos,
		HTTPHeader:      h,
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		// 503 means one thing to nginx in front of the relay: THIS COPY is
		// draining, try the other (proxy_next_upstream http_503, and it
		// counts towards max_fails). A 503 from one station's router or
		// harbor passed on as is would send the retry to the other copy,
		// get the same 503 there, and mark both copies down: every studio,
		// Free included, refused for fail_timeout. So it goes out as 502.
		if resp != nil && resp.StatusCode >= 400 && resp.StatusCode != http.StatusServiceUnavailable {
			return nil, resp.StatusCode
		}
		return nil, http.StatusBadGateway
	}
	return up, 0
}

// pipeHarbor copies frames both ways until either side ends, and closes the
// other side the way the first one ended. It returns a metrics label.
func (s *Server) pipeHarbor(parent context.Context, ws, up *websocket.Conn, st *conn) string {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	if s.cfg.PingInterval > 0 {
		go s.keepAlive(ctx, ws)
	}

	var (
		once   sync.Once
		reason string
		wg     sync.WaitGroup
		// Which side ended first. The other side's read then fails because
		// the relay closed it, which says nothing.
		ended atomic.Bool
	)
	// Harbor not taking a frame for HarborWriteTimeout. The flag is set
	// before harbor's socket is closed, so whichever read notices the close
	// first reports the stall, not "harbor closed". The timer only acts on a
	// write still in flight (under wmu), so a write that finishes just as it
	// fires is not cut and mislabelled.
	var (
		stalled  atomic.Bool
		wmu      sync.Mutex
		inFlight bool
	)
	tellStudioHarborStalled := func() {
		up.CloseNow()
		ws.Close(CloseHarborWrite, "stream server stopped accepting audio")
	}
	// Left as is on purpose: a write that returns in the nanoseconds between
	// the timer firing and it taking wmu is still a write that blocked for
	// the whole HarborWriteTimeout, which is the stall this reports. Closing
	// on that is the right call, not a healthy show cut short.
	stall := time.AfterFunc(s.cfg.HarborWriteTimeout, func() {
		wmu.Lock()
		defer wmu.Unlock()
		if inFlight {
			stalled.Store(true)
			up.CloseNow()
		}
	})
	stall.Stop()
	defer stall.Stop()
	writeHarbor := func(typ websocket.MessageType, data []byte) error {
		wmu.Lock()
		inFlight = true
		wmu.Unlock()
		stall.Reset(s.cfg.HarborWriteTimeout)
		err := up.Write(ctx, typ, data)
		wmu.Lock()
		inFlight = false
		wmu.Unlock()
		stall.Stop()
		return err
	}

	finish := func(r string, closeOther func()) {
		once.Do(func() {
			ended.Store(true)
			reason = r
			if st.kicked.Load() {
				// Drain is closing the studio with 1001; a second close of
				// the studio would race it. Harbor is let go here too: drain
				// already did it unless it caught this connection before its
				// release was recorded, and a mount left held would turn the
				// studio's reconnect away until harbor's own timeout.
				reason = "harbor_draining"
				up.CloseNow()
				return
			}
			go closeOther()
		})
	}

	// Studio → harbor: audio, the hello, metadata.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			typ, data, err := ws.Read(ctx)
			if err != nil {
				if ended.Load() {
					return
				}
				code, why := closeOf(err)
				label := "harbor_client_closed"
				switch {
				// coder/websocket has already closed the studio with 1009;
				// the error it returns is a plain "read limited" one.
				case code == websocket.StatusMessageTooBig || strings.Contains(err.Error(), "read limited"):
					label = "harbor_too_big"
				// Closed from this side, not by the studio: a write to the
				// studio (a ping, or a frame from harbor) timed out because
				// the studio stopped reading, and coder/websocket closed the
				// socket. The studio did not leave; the relay gave up on it.
				case code == -1 && errors.Is(err, net.ErrClosed):
					label = "harbor_studio_stalled"
				}
				finish(label, func() { forwardClose(up, code, why) })
				return
			}
			// A timer rather than a deadline on the write's context: the
			// write cut short by its context closes harbor's socket before
			// this goroutine can say why (see stalled above).
			if err := writeHarbor(typ, data); err != nil {
				if ended.Load() {
					return
				}
				if stalled.Load() {
					finish("harbor_write", tellStudioHarborStalled)
				}
				// Otherwise harbor's socket is closed (a failed write closes
				// it), and the harbor read below reports it with harbor's own
				// close code. Reporting here would race that read and could
				// hand the studio a bare drop instead of, say, 1011.
				return
			}
			if typ == websocket.MessageBinary {
				s.Metrics.bytesIn(PathHarbor, len(data))
			}
		}
	}()

	// Harbor → studio: normally nothing until the close.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			typ, data, err := up.Read(ctx)
			if err != nil {
				if ended.Load() {
					return
				}
				if stalled.Load() {
					finish("harbor_write", tellStudioHarborStalled)
					return
				}
				code, why := closeOf(err)
				finish("harbor_closed", func() { forwardClose(ws, code, why) })
				return
			}
			wctx, wcancel := context.WithTimeout(ctx, s.cfg.HarborWriteTimeout)
			err = ws.Write(wctx, typ, data)
			wcancel()
			if err != nil {
				// A failed write closes the studio's socket; the studio read
				// above reports it.
				return
			}
		}
	}()

	wg.Wait()
	// Both reads have returned, so both sockets are closed or closing. The
	// closer goroutine may still be in its handshake; it ends on its own
	// (coder/websocket gives a close handshake 5 s).
	return reason
}

// closeOf reads the close code and reason a peer sent; -1 when the socket
// dropped without one.
func closeOf(err error) (websocket.StatusCode, string) {
	var ce websocket.CloseError
	if errors.As(err, &ce) {
		return ce.Code, ce.Reason
	}
	return -1, ""
}

// forwardClose closes c the way its partner was closed. A partner that
// dropped without a close frame, or with a code that may not be sent on the
// wire (1005, 1006, 1015), is passed on as a drop too: the studio then sees
// exactly what it sees today when harbor or the router hangs up.
func forwardClose(c *websocket.Conn, code websocket.StatusCode, why string) {
	switch {
	case code == -1, code == websocket.StatusNoStatusRcvd,
		code == websocket.StatusAbnormalClosure, code == websocket.StatusTLSHandshake:
		c.CloseNow()
	default:
		c.Close(code, why)
	}
}

// ValidateOriginPatterns refuses patterns originAllowed would read
// differently from websocket.Accept. Accept matches a pattern holding "://"
// against scheme+host; originAllowed, which runs first so a foreign page
// never costs a dial to harbor, only knows hosts. Bare hosts (with optional
// port and globs) mean the same to both, so those are all that is allowed.
func ValidateOriginPatterns(patterns []string) error {
	for _, p := range patterns {
		if strings.Contains(p, "://") || strings.Contains(p, "/") {
			return fmt.Errorf("origin pattern %q: give the host only, e.g. gocast.fm or *.gocast.fm", p)
		}
		if _, err := path.Match(p, ""); err != nil {
			return fmt.Errorf("origin pattern %q: %v", p, err)
		}
	}
	return nil
}

// originAllowed applies the same rule websocket.Accept does, before the relay
// spends a dial on harbor: no Origin (a native app), the request's own host,
// or a host matching one of the patterns. Equivalent to Accept for the
// patterns ValidateOriginPatterns lets through.
func originAllowed(r *http.Request, patterns []string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(r.Host, u.Host) {
		return true
	}
	for _, p := range patterns {
		if ok, _ := path.Match(strings.ToLower(p), strings.ToLower(u.Host)); ok {
			return true
		}
	}
	return false
}

// HarborAddrOK checks the -harbor flag: host:port, nothing else.
func HarborAddrOK(addr string) error {
	_, _, err := net.SplitHostPort(addr)
	return err
}
