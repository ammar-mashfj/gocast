package relay

// The sockets a studio session holds, and how each can be frozen at any
// byte for a hand-off (handoff.go).
//
// A link is one TCP socket. Writes go out whole frames at a time under wmu.
// Freezing a link sets `frozen` and moves both deadlines into the past:
//   - a read in progress returns at once, keeping what it has read in the
//     caller's buffer;
//   - a write in progress returns at once too, and whatever of it the kernel
//     had not taken is kept in `pending`;
//   - any write after that goes to `pending` without touching the socket.
//
// So once every reader has parked, the socket's whole state is: the bytes in
// the read buffer, the bytes in pending, and the kernel's own queues, which
// move with the descriptor. That is what a hand-off carries, and why the
// peers on both ends never see anything happen.

import (
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// closeWait is how long a close handshake waits for the peer's reply before
// it drops the socket: what the library before this did.
const closeWait = 5 * time.Second

var pastDeadline = time.Unix(1, 0)

// errStalled: the peer took none of a write for the link's whole timeout.
var errStalled = errors.New("peer stopped reading")

func isDeadline(err error) bool { return errors.Is(err, os.ErrDeadlineExceeded) }

type link struct {
	nc      net.Conn
	timeout time.Duration // a write blocked this long means the peer stalled

	frozen atomic.Bool

	wmu          sync.Mutex
	pending      []byte    // owed to the peer, not yet written (a hand-off's doing)
	pendingSince time.Time // when the oldest of those bytes began to be written
}

func newLink(nc net.Conn, timeout time.Duration) link {
	return link{nc: nc, timeout: timeout}
}

// write sends b, after anything still pending. A frozen link only queues.
func (l *link) write(b []byte) error {
	l.wmu.Lock()
	defer l.wmu.Unlock()
	if l.frozen.Load() {
		if len(b) > 0 {
			if len(l.pending) == 0 {
				l.pendingSince = time.Now()
			}
			l.pending = append(l.pending, b...)
		}
		return nil
	}
	buf, since := b, time.Now()
	if len(l.pending) > 0 {
		buf = append(l.pending, b...)
		since = l.pendingSince
		l.pending, l.pendingSince = nil, time.Time{}
	}
	if len(buf) == 0 {
		return nil
	}
	// Set, then look at frozen again: a freeze between the two would
	// otherwise have its past deadline overwritten by this one, and this
	// write could block for the whole timeout during a hand-off.
	l.nc.SetWriteDeadline(since.Add(l.timeout))
	if l.frozen.Load() {
		l.nc.SetWriteDeadline(pastDeadline)
	}
	n, err := l.nc.Write(buf)
	if err == nil {
		return nil
	}
	if isDeadline(err) && l.frozen.Load() {
		l.pending = append([]byte(nil), buf[n:]...)
		l.pendingSince = since
		return nil
	}
	if isDeadline(err) {
		return errStalled
	}
	return err
}

func (l *link) freeze() {
	l.frozen.Store(true)
	l.nc.SetReadDeadline(pastDeadline)
	l.nc.SetWriteDeadline(pastDeadline)
}

func (l *link) thaw() {
	l.frozen.Store(false)
	l.nc.SetReadDeadline(time.Time{})
}

func (l *link) closeNow() { l.nc.Close() }

// parked reports whether a read error is this link's freeze, not the peer.
func (l *link) parked(err error) bool { return l.frozen.Load() && isDeadline(err) }

// wsConn is a WebSocket on a link.
type wsConn struct {
	link
	client bool // the relay dialled this one (harbor): its frames are masked
	p      frameParser
	rbuf   []byte // read, not yet parsed

	closeSent atomic.Bool // our close frame is out: the peer's close is its reply
}

func newWSConn(nc net.Conn, client bool, maxMessage int64, timeout time.Duration, leftover []byte) *wsConn {
	c := &wsConn{link: newLink(nc, timeout), client: client}
	c.p = frameParser{expectMasked: !client, maxMessage: maxMessage}
	c.rbuf = append(make([]byte, 0, 4096), leftover...)
	return c
}

// readFrame returns the next frame. On error, every byte read and not yet
// used stays in rbuf: after a freeze, that is what moves with the socket.
func (c *wsConn) readFrame() (wsFrame, error) {
	for {
		f, n, err := c.p.parse(c.rbuf)
		if err != nil {
			return f, err
		}
		if n > 0 {
			c.rbuf = c.rbuf[:copy(c.rbuf, c.rbuf[n:])]
			return f, nil
		}
		if cap(c.rbuf)-len(c.rbuf) < 4096 {
			grown := make([]byte, len(c.rbuf), 2*cap(c.rbuf)+4096)
			copy(grown, c.rbuf)
			c.rbuf = grown
		}
		k, err := c.nc.Read(c.rbuf[len(c.rbuf):cap(c.rbuf)])
		c.rbuf = c.rbuf[:len(c.rbuf)+k]
		if err != nil && k == 0 {
			return wsFrame{}, err
		}
	}
}

func (c *wsConn) writeFrame(fin bool, op byte, payload []byte) error {
	return c.write(appendFrame(nil, fin, op, payload, c.client))
}

// writeClose sends our close frame, once.
func (c *wsConn) writeClose(code int, reason string) error {
	if c.closeSent.Swap(true) {
		return nil
	}
	return c.writeFrame(true, opClose, closePayload(code, reason))
}

// closeHandshake sends close and gives the peer closeWait to answer; the
// reader that sees the answer drops the socket, or the timer does.
func (c *wsConn) closeHandshake(code int, reason string) {
	if c.closeSent.Load() {
		return
	}
	if err := c.writeClose(code, reason); err != nil {
		c.closeNow()
		return
	}
	time.AfterFunc(closeWait, c.closeNow)
}

// answerClose is the reply to a close the peer started: echo it, then drop
// the socket, as RFC 6455 has the server do.
func (c *wsConn) answerClose(payload []byte) {
	if !c.closeSent.Swap(true) {
		c.write(appendFrame(nil, true, opClose, payload, c.client))
	}
	c.closeNow()
}

// closeAndWait is a whole close handshake on a connection with no reader of
// its own (the setup phase): send close, read until the answer, drop.
func (c *wsConn) closeAndWait(code int, reason string) {
	if err := c.writeClose(code, reason); err != nil {
		c.closeNow()
		return
	}
	c.nc.SetReadDeadline(time.Now().Add(closeWait))
	for {
		f, err := c.readFrame()
		if err != nil || f.op == opClose {
			break
		}
	}
	c.closeNow()
}

// ---- Handshakes ------------------------------------------------------------

type upgradeError struct {
	status int
	msg    string
}

func (e *upgradeError) Error() string { return e.msg }

func headerTokens(h http.Header, name string) []string {
	var out []string
	for _, v := range h.Values(name) {
		for _, t := range strings.Split(v, ",") {
			if t = strings.TrimSpace(t); t != "" {
				out = append(out, t)
			}
		}
	}
	return out
}

func hasToken(h http.Header, name, token string) bool {
	for _, t := range headerTokens(h, name) {
		if strings.EqualFold(t, token) {
			return true
		}
	}
	return false
}

// checkUpgrade is RFC 6455 §4.2.1 for an incoming handshake.
func checkUpgrade(r *http.Request) *upgradeError {
	if !r.ProtoAtLeast(1, 1) {
		return &upgradeError{http.StatusBadRequest, "WebSocket handshake needs HTTP/1.1"}
	}
	if !hasToken(r.Header, "Connection", "upgrade") || !hasToken(r.Header, "Upgrade", "websocket") {
		return &upgradeError{http.StatusUpgradeRequired, "WebSocket upgrade required"}
	}
	if r.Method != http.MethodGet {
		return &upgradeError{http.StatusMethodNotAllowed, "WebSocket handshake must be a GET"}
	}
	if r.Header.Get("Sec-WebSocket-Version") != "13" {
		return &upgradeError{http.StatusBadRequest, "unsupported WebSocket version"}
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if b, err := base64.StdEncoding.DecodeString(key); err != nil || len(b) != 16 {
		return &upgradeError{http.StatusBadRequest, "bad Sec-WebSocket-Key"}
	}
	return nil
}

// selectSubprotocol picks the first of ours the client offered.
func selectSubprotocol(r *http.Request, ours []string) string {
	offered := headerTokens(r.Header, "Sec-WebSocket-Protocol")
	for _, p := range ours {
		for _, o := range offered {
			if strings.EqualFold(p, o) {
				return o
			}
		}
	}
	return ""
}

// acceptUpgrade takes the connection from net/http and completes the
// handshake. checkUpgrade must have passed.
func acceptUpgrade(w http.ResponseWriter, r *http.Request, proto string, maxMessage int64, timeout time.Duration) (*wsConn, error) {
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "cannot take over this connection", http.StatusInternalServerError)
		return nil, errors.New("response writer cannot hijack")
	}
	nc, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	// The server's own read and write deadlines stay on a hijacked conn.
	nc.SetDeadline(time.Time{})
	var left []byte
	if n := brw.Reader.Buffered(); n > 0 {
		left, _ = brw.Reader.Peek(n)
	}
	resp := "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + acceptKey(r.Header.Get("Sec-WebSocket-Key")) + "\r\n"
	if proto != "" {
		resp += "Sec-WebSocket-Protocol: " + proto + "\r\n"
	}
	c := newWSConn(nc, false, maxMessage, timeout, left)
	if err := c.write([]byte(resp + "\r\n")); err != nil {
		nc.Close()
		return nil, err
	}
	return c, nil
}

// dialError is a handshake the far end refused: status is its HTTP answer
// (0 when there was none: refused, timed out, not a WebSocket server).
type dialError struct {
	status int
	err    error
}

func (e *dialError) Error() string { return e.err.Error() }

// dialWebSocket opens a client WebSocket at ws://addr+path. ctx bounds the
// connect and the handshake.
func dialWebSocket(ctx context.Context, addr, path string, protos []string, hdr http.Header, maxMessage int64, timeout time.Duration) (*wsConn, string, error) {
	var d net.Dialer
	nc, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, "", &dialError{0, err}
	}
	if dl, ok := ctx.Deadline(); ok {
		nc.SetDeadline(dl)
	}
	stop := context.AfterFunc(ctx, func() { nc.SetDeadline(pastDeadline) })
	defer stop()
	fail := func(status int, err error) (*wsConn, string, error) {
		nc.Close()
		return nil, "", &dialError{status, err}
	}

	key := newKey()
	var req strings.Builder
	fmt.Fprintf(&req, "GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n", path, addr)
	fmt.Fprintf(&req, "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n", key)
	if len(protos) > 0 {
		fmt.Fprintf(&req, "Sec-WebSocket-Protocol: %s\r\n", strings.Join(protos, ", "))
	}
	for name, vals := range hdr {
		for _, v := range vals {
			if !strings.ContainsAny(name+v, "\r\n") {
				fmt.Fprintf(&req, "%s: %s\r\n", name, v)
			}
		}
	}
	req.WriteString("\r\n")
	if _, err := nc.Write([]byte(req.String())); err != nil {
		return fail(0, err)
	}
	br := bufio.NewReader(nc)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		return fail(0, err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		return fail(resp.StatusCode, fmt.Errorf("upgrade refused: %s", resp.Status))
	}
	if !hasToken(resp.Header, "Upgrade", "websocket") || !hasToken(resp.Header, "Connection", "upgrade") ||
		resp.Header.Get("Sec-WebSocket-Accept") != acceptKey(key) {
		return fail(0, errors.New("not a WebSocket answer"))
	}
	proto := resp.Header.Get("Sec-WebSocket-Protocol")
	if proto != "" {
		ok := false
		for _, p := range protos {
			ok = ok || p == proto
		}
		if !ok {
			return fail(0, fmt.Errorf("server chose subprotocol %q, never offered", proto))
		}
	}
	if !stop() { // ctx ended just now: the deadline is already in the past
		return fail(0, ctx.Err())
	}
	nc.SetDeadline(time.Time{})
	var left []byte
	if n := br.Buffered(); n > 0 {
		left, _ = br.Peek(n)
	}
	return newWSConn(nc, true, maxMessage, timeout, left), proto, nil
}
