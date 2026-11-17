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
	"time"
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
const CloseHarborWrite = StatusInternalError

// serveHarbor runs one studio's pass-through and records why it ended.
func (s *Server) serveHarbor(w http.ResponseWriter, r *http.Request, slug string) {
	// Not a valid upgrade: refuse before spending a dial on harbor.
	if e := checkUpgrade(r); e != nil {
		http.Error(w, e.msg, e.status)
		s.Metrics.Close("refused_upgrade")
		return
	}
	if !originAllowed(r, s.cfg.OriginPatterns) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		s.Metrics.Close("harbor_refused_origin")
		return
	}

	up, proto, status := s.dialHarbor(r, slug)
	if up == nil {
		http.Error(w, "stream server unavailable", status)
		s.Metrics.Close("harbor_unreachable")
		return
	}
	// A drain or retire that began during the dial: refuse the upgrade, so
	// nginx retries the other copy, rather than accept and close with 1001.
	if s.Draining() {
		up.closeNow()
		http.Error(w, "draining", http.StatusServiceUnavailable)
		s.Metrics.Close("harbor_draining")
		return
	}

	// Offer the studio whatever harbor chose, so the studio sees the same
	// handshake it would have seen from the router.
	var ours []string
	if proto != "" {
		ours = []string{proto}
	}
	studio, err := acceptUpgrade(w, r, selectSubprotocol(r, ours), s.cfg.MaxMessage, s.cfg.HarborWriteTimeout)
	if err != nil {
		up.closeNow()
		s.Metrics.Close("refused_upgrade")
		return
	}
	ss := newSession(s, PathHarbor, studio)
	ss.up = up
	ss.id = slug + "-" + ss.id
	if _, ok := s.track(ss, PathHarbor); !ok {
		// The few microseconds between the check above and here.
		up.closeNow()
		studio.closeAndWait(CloseDraining, "relay restarting")
		s.Metrics.Close("harbor_draining")
		return
	}
	// A drain lets go of harbor first, so the studio's reconnect through the
	// other copy finds the mount free instead of "source already connected".
	s.holdsSource(ss, up.closeNow)
	s.Metrics.connOpened(PathHarbor)
	s.finish(ss, ss.runHarbor())
}

// dialHarbor opens the relay's own socket to the station router. On failure
// it returns the HTTP status to refuse the studio's upgrade with: the
// router's own answer when there was one (502 for a station that is off).
func (s *Server) dialHarbor(r *http.Request, slug string) (*wsConn, string, int) {
	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.HarborTimeout)
	defer cancel()

	h := http.Header{}
	// The router overwrites X-Real-IP with its own peer, but pass on what
	// nginx told us so the chain still carries the broadcaster's address.
	for _, k := range []string{"X-Forwarded-For", "X-Real-IP", "User-Agent"} {
		if v := r.Header.Get(k); v != "" {
			h.Set(k, v)
		}
	}
	protos := headerTokens(r.Header, "Sec-WebSocket-Protocol")
	up, proto, err := dialWebSocket(ctx, s.cfg.HarborAddr, "/broadcast/"+slug, protos, h, s.cfg.MaxMessage, s.cfg.HarborWriteTimeout)
	if err != nil {
		// 503 means one thing to nginx in front of the relay: THIS COPY is
		// draining, try the other (proxy_next_upstream http_503, and it
		// counts towards max_fails). A 503 from one station's router or
		// harbor passed on as is would send the retry to the other copy,
		// get the same 503 there, and mark both copies down: every studio,
		// Free included, refused for fail_timeout. So it goes out as 502.
		var de *dialError
		if errors.As(err, &de) && de.status >= 400 && de.status != http.StatusServiceUnavailable {
			return nil, "", de.status
		}
		return nil, "", http.StatusBadGateway
	}
	return up, proto, 0
}

func (ss *session) runHarbor() string {
	if testHookBeforeLive != nil {
		testHookBeforeLive(ss)
	}
	ss.mu.Lock()
	// A drain's kick between track and here has already let harbor go and
	// told the studio 1001: going live now would overwrite that, and the
	// close would be counted under another reason.
	if ss.state != stSetup {
		ss.mu.Unlock()
		return ss.endLabel()
	}
	ss.nextPing.Store(time.Now().Add(ss.srv.cfg.PingInterval).UnixNano())
	ss.goLiveLocked(ss.harborStudioReader, ss.harborReader)
	ss.mu.Unlock()
	return ss.wait()
}

// harborStudioReader: studio → harbor. The hello, audio and metadata go
// through frame for frame (re-masked, as a client must); pings and pongs are
// the relay's own business with the studio.
func (ss *session) harborStudioReader() {
	c, up := ss.studio, ss.up
	upBroken := false
	var scratch []byte
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
		if upBroken {
			continue
		}
		if err := up.forwardFrame(&scratch, f.fin, f.op, f.payload); err != nil {
			if errors.Is(err, errStalled) {
				ss.harborWriteFailed(err)
				continue
			}
			// Harbor's socket broke. Harbor's reader reports it, with
			// harbor's own close code if it sent one; reporting here would
			// race that read and could hand the studio a bare drop instead
			// of, say, 1011. Keep reading the studio for its close reply.
			upBroken = true
			continue
		}
		if f.msgOp == opBinary {
			ss.srv.Metrics.bytesIn(PathHarbor, len(f.payload))
		}
	}
}

// harborReader: harbor → studio. Normally nothing until the close.
func (ss *session) harborReader() {
	c, up := ss.studio, ss.up
	studioBroken := false
	var scratch []byte
	for {
		f, err := up.readFrame()
		if err != nil {
			if handled, exit := ss.park(err); handled {
				if exit {
					return
				}
				continue
			}
			if ss.ending() {
				up.closeNow()
				return
			}
			code, why := closeCodeFor(err, ss.srv.cfg.MaxMessage)
			ss.end("harbor_closed", func() {
				if code != 0 {
					up.writeClose(code, why)
				}
				up.closeNow()
				c.closeNow() // a drop, as the studio sees when harbor hangs up on it
			})
			return
		}
		if ss.ending() {
			if f.op == opClose {
				up.closeNow()
				return
			}
			continue
		}
		switch f.op {
		case opPing:
			up.writeFrame(true, opPong, f.payload) // a failure is the next read's to report
			continue
		case opPong:
			continue
		case opClose:
			code, reason, perr := parseClose(f.payload)
			if perr != nil {
				ss.end("harbor_closed", func() {
					up.writeClose(StatusProtocolError, perr.Error())
					up.closeNow()
					c.closeNow()
				})
				return
			}
			if !ss.end("harbor_closed", func() {
				up.answerClose(f.payload)
				forwardClose(c, code, reason)
			}) {
				up.closeNow()
			}
			return
		}
		if studioBroken {
			continue
		}
		if err := c.forwardFrame(&scratch, f.fin, f.op, f.payload); err != nil {
			if errors.Is(err, errStalled) {
				ss.studioWriteFailed(err)
				continue
			}
			studioBroken = true // the studio reader reports it
		}
	}
}

// harborWriteFailed: harbor took nothing for HarborWriteTimeout. Anything
// else is harbor's socket breaking, which harbor's reader reports.
func (ss *session) harborWriteFailed(err error) {
	if !errors.Is(err, errStalled) {
		return
	}
	ss.end("harbor_write", func() {
		ss.up.closeNow()
		ss.studio.closeHandshake(CloseHarborWrite, "stream server stopped accepting audio")
	})
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
