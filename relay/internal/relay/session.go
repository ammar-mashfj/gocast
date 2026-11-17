package relay

// A session is one studio connection and the socket it feeds (Icecast for
// Free, harbor for container studios), from the upgrade to the end, or to
// the moment it moves to another relay process (handoff.go).
//
// States:
//
//	setup     Free path only: hello, Icecast login, "ok". Never handed off.
//	live      audio flowing; can be frozen for a hand-off.
//	freezing  every socket frozen (wslink.go); its readers park one by one.
//	          Ends in exactly one of: handed (the other process has it),
//	          live again (the hand-off was called off), or ending (the
//	          session ended while frozen; the freeze is undone first).
//	handed    the other process owns the sockets; this one only lets go.
//	ending    closing, for the reason in `label` (the first to end it wins).
//	adopted   received by a hand-off, waiting for the sender's commit.
//
// Readers are the goroutines that read a socket (studio, and Icecast or
// harbor). Only readers act on what arrives, so once all of them are parked
// nothing can change a socket but the kernel.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

type sessionState int

const (
	stSetup sessionState = iota
	stLive
	stFreezing
	stHanded
	stEnding
	stAdopted
)

// pingPayload marks the relay's own pings (any payload up to 125 bytes is
// allowed; the browser echoes it in its pong, which the relay ignores).
var pingPayload = []byte("gocast")

type session struct {
	srv  *Server
	path string
	id   string // for logs: slug-random

	studio *wsConn
	up     *wsConn // harbor path
	ice    *link   // Icecast path, once logged in
	track  *conn

	ctx    context.Context // cancelled when the session ends (stops an Icecast login)
	cancel context.CancelFunc

	mu      sync.Mutex
	cond    *sync.Cond
	state   sessionState
	label   string
	readers int
	parked  int
	done    chan struct{} // closed when the last reader returns

	lastAudio atomic.Int64 // unix ns: the Icecast path's idle clock
	nextPing  atomic.Int64 // unix ns
	pingTimer *time.Timer
	idleTimer *time.Timer
}

func newSession(srv *Server, path string, studio *wsConn) *session {
	ss := &session{srv: srv, path: path, studio: studio, done: make(chan struct{})}
	ss.cond = sync.NewCond(&ss.mu)
	ss.ctx, ss.cancel = context.WithCancel(context.Background())
	var b [3]byte
	rand.Read(b[:])
	ss.id = hex.EncodeToString(b[:])
	return ss
}

func (ss *session) name() string { return ss.path + "/" + ss.id }

// reason is a close label for this session's path: the container path's
// labels carry a "harbor_" prefix (harbor_draining, harbor_client_closed, ...).
func (ss *session) reason(base string) string {
	if ss.path == PathHarbor {
		return "harbor_" + base
	}
	return base
}

// links are every socket the session holds, studio first.
func (ss *session) links() []*link {
	ls := []*link{&ss.studio.link}
	if ss.up != nil {
		ls = append(ls, &ss.up.link)
	}
	if ss.ice != nil {
		ls = append(ls, ss.ice)
	}
	return ls
}

func (ss *session) ending() bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return ss.state == stEnding
}

// ---- Readers -----------------------------------------------------------------

// goLiveLocked starts the readers and timers. ss.mu held.
func (ss *session) goLiveLocked(readers ...func()) {
	ss.state = stLive
	ss.armTimersLocked()
	ss.flushPendingLocked()
	ss.readers = len(readers)
	for _, r := range readers {
		go func() {
			defer ss.readerDone()
			r()
		}()
	}
}

func (ss *session) readerDone() {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.readers--
	ss.cond.Broadcast()
	if ss.readers == 0 {
		close(ss.done)
	}
}

// park is what a reader does with a failed read. In a live session the only
// deadline on a read is a freeze's, so a deadline error is always one:
//
//	handled=false        a real error, for the caller to deal with;
//	handled, !exit       the freeze was undone (or the session is ending):
//	                     read again;
//	handled, exit        the session is another process's now: return.
func (ss *session) park(err error) (handled, exit bool) {
	if !isDeadline(err) {
		return false, false
	}
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.parked++
	ss.cond.Broadcast()
	for ss.state == stFreezing {
		ss.cond.Wait()
	}
	ss.parked--
	return true, ss.state == stHanded
}

// wait blocks until the session is over here and returns why: a close
// label, or "" when it was handed to another process.
func (ss *session) wait() string {
	<-ss.done
	ss.cancel()
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.stopTimersLocked()
	if ss.state == stHanded {
		return ""
	}
	if ss.label == "" {
		return "unknown" // never expected: every way to end sets a reason
	}
	return ss.label
}

// ---- Ending ------------------------------------------------------------------

// end ends the session for `label` and runs `close` -- unless something else
// ended it first (or it has been handed off), in which case it does nothing.
// A session caught frozen is thawed first, which calls off its hand-off.
func (ss *session) end(label string, close func()) bool {
	ss.mu.Lock()
	switch ss.state {
	case stEnding, stHanded, stAdopted:
		ss.mu.Unlock()
		return false
	case stFreezing:
		ss.thawLocked(stEnding)
	default:
		ss.state = stEnding
	}
	ss.label = label
	ss.stopTimersLocked()
	ss.mu.Unlock()
	ss.cancel()
	close()
	return true
}

// kick ends the session for a restart: let go of Icecast or harbor first, so
// the studio's reconnect through the other copy finds the mount free, then
// tell the studio 1001. `release` is the recorded way to let go (nil before
// one is recorded; the upstream is closed either way). The session is marked
// ending before anything is closed, so the upstream closing is not taken for
// Icecast or harbor ending the show.
func (ss *session) kick(release func()) {
	ss.track.kicked.Store(true)
	ss.mu.Lock()
	if ss.state == stAdopted {
		// Not started yet; startAdopted sees kicked and ends it then.
		ss.mu.Unlock()
		return
	}
	ice, up := ss.ice, ss.up
	ss.mu.Unlock()
	ss.end(ss.reason("draining"), func() {
		if release != nil {
			release()
		}
		if ice != nil {
			ice.closeNow()
		}
		if up != nil {
			up.closeNow()
		}
		ss.studio.closeHandshake(CloseDraining, "relay restarting")
	})
}

// forwardClose closes c the way its partner was closed. A partner that
// dropped without a close frame, or with a code that may not be sent on the
// wire (1005, 1006, 1015), is passed on as a drop: the studio then sees
// exactly what it sees when harbor or the router hangs up on it directly.
func forwardClose(c *wsConn, code int, why string) {
	switch code {
	case -1, StatusNoStatusRcvd, StatusAbnormalClosure, StatusTLSHandshake:
		c.closeNow()
	default:
		c.closeHandshake(code, why)
	}
}

// ---- Timers ------------------------------------------------------------------

func (ss *session) armTimersLocked() {
	cfg := ss.srv.cfg
	if cfg.PingInterval > 0 {
		d := time.Until(time.Unix(0, ss.nextPing.Load()))
		ss.pingTimer = resetOrNew(ss.pingTimer, max(d, 0), ss.onPing)
	}
	if ss.path == PathIcecast {
		d := time.Until(time.Unix(0, ss.lastAudio.Load()).Add(cfg.IdleTimeout))
		ss.idleTimer = resetOrNew(ss.idleTimer, max(d, 0), ss.onIdle)
	}
}

func resetOrNew(t *time.Timer, d time.Duration, f func()) *time.Timer {
	if t == nil {
		return time.AfterFunc(d, f)
	}
	t.Reset(d)
	return t
}

func (ss *session) stopTimersLocked() {
	if ss.pingTimer != nil {
		ss.pingTimer.Stop()
	}
	if ss.idleTimer != nil {
		ss.idleTimer.Stop()
	}
}

// onPing keeps Cloudflare from closing the studio's socket: audio only flows
// towards the origin, and Cloudflare cuts a WebSocket after 6010 s with
// nothing coming back. A missing pong never ends anything; a studio that is
// really gone stops sending audio, and that ends it.
func (ss *session) onPing() {
	ss.mu.Lock()
	if ss.state != stLive {
		ss.mu.Unlock()
		return
	}
	iv := ss.srv.cfg.PingInterval
	ss.nextPing.Store(time.Now().Add(iv).UnixNano())
	ss.pingTimer.Reset(iv)
	ss.mu.Unlock()
	if err := ss.studio.writeFrame(true, opPing, pingPayload); err != nil {
		ss.studioWriteFailed(err)
	}
}

// onIdle ends a Free show whose studio has sent no audio for IdleTimeout:
// its source is released at once (the reconnect needs the mount free), and
// the studio is told 1008, not left to see a bare drop.
func (ss *session) onIdle() {
	ss.mu.Lock()
	if ss.state != stLive {
		ss.mu.Unlock()
		return
	}
	left := time.Until(time.Unix(0, ss.lastAudio.Load()).Add(ss.srv.cfg.IdleTimeout))
	if left > 0 {
		ss.idleTimer.Reset(left)
		ss.mu.Unlock()
		return
	}
	ice := ss.ice
	ss.mu.Unlock()
	ss.end("idle", func() {
		ice.closeNow()
		ss.studio.closeHandshake(CloseIdle, "no audio")
	})
}

// studioWriteFailed handles a write to the studio that did not go through.
// A stall (the studio took nothing for the whole write timeout) ends the
// session here; any other failure means the socket is gone, which the
// studio reader is about to report.
func (ss *session) studioWriteFailed(err error) {
	if !errors.Is(err, errStalled) {
		return
	}
	ss.mu.Lock()
	ice, up := ss.ice, ss.up
	ss.mu.Unlock()
	ss.end(ss.reason("studio_stalled"), func() {
		if ice != nil {
			ice.closeNow()
		}
		if up != nil {
			up.closeNow()
		}
		ss.studio.closeNow()
	})
}

// ---- Freezing (the sending side of a hand-off) -----------------------------

// freeze stops the session at whatever byte each socket is on. It returns
// false if the session is not live, ended while freezing, or a reader did
// not park within `wait` (the freeze is then undone and the show goes on
// here).
func (ss *session) freeze(wait time.Duration) bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.state != stLive {
		return false
	}
	ss.state = stFreezing
	ss.stopTimersLocked()
	for _, l := range ss.links() {
		l.freeze()
	}
	timedOut := false
	t := time.AfterFunc(wait, func() {
		ss.mu.Lock()
		timedOut = true
		ss.cond.Broadcast()
		ss.mu.Unlock()
	})
	defer t.Stop()
	for ss.state == stFreezing && ss.parked < ss.readers && !timedOut {
		ss.cond.Wait()
	}
	if ss.state != stFreezing {
		return false
	}
	if ss.parked < ss.readers {
		ss.thawLocked(stLive)
		return false
	}
	return true
}

// thawLocked undoes a freeze into state `to` (live: the hand-off was called
// off; ending: the session ended while frozen). ss.mu held.
func (ss *session) thawLocked(to sessionState) {
	for _, l := range ss.links() {
		l.thaw()
	}
	ss.state = to
	if to == stLive {
		ss.armTimersLocked()
	}
	ss.flushPendingLocked()
	ss.cond.Broadcast()
}

// flushPendingLocked writes out whatever a freeze left owed to each peer.
// Anything else written meanwhile goes after it (link.write keeps order).
// Checked through the owed flag, never pending itself: that needs the write
// lock, which a stalled write can hold for its whole timeout, and ss.mu must
// never wait on it.
func (ss *session) flushPendingLocked() {
	for _, l := range ss.links() {
		if !l.hasOwed() {
			continue
		}
		go func() {
			if err := l.write(nil); err != nil {
				ss.writeFailed(l, err)
			}
		}()
	}
}

// writeFailed routes a failed flush to the same handling as any other write
// to that socket.
func (ss *session) writeFailed(l *link, err error) {
	switch {
	case l == &ss.studio.link:
		ss.studioWriteFailed(err)
	case ss.up != nil && l == &ss.up.link:
		ss.harborWriteFailed(err)
	case l == ss.ice:
		ss.iceWriteFailed(err)
	}
}

// unfreeze calls a hand-off off: the session carries on here.
func (ss *session) unfreeze() {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.state == stFreezing {
		ss.thawLocked(stLive)
	}
}

// snapshot is the frozen session as the other process needs it, or nil if
// it is no longer frozen (a drain ended it after freeze returned). Taken
// under ss.mu: the readers' buffers are theirs again the moment a thaw wakes
// them, and a thaw needs ss.mu. Taking each write lock waits out a write that
// was in flight when the freeze came (it returns at once, its rest kept
// pending); a frozen link never holds its write lock for long.
func (ss *session) snapshot() *sessionSnap {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.state != stFreezing {
		return nil
	}
	snap := &sessionSnap{
		V:         HandoffVersion,
		Path:      ss.path,
		ID:        ss.id,
		LastAudio: ss.lastAudio.Load(),
		NextPing:  ss.nextPing.Load(),
	}
	snap.Studio = snapWS(ss.studio)
	if ss.up != nil {
		u := snapWS(ss.up)
		snap.Up = &u
	}
	if ss.ice != nil {
		i := snapLink(ss.ice)
		snap.Ice = &i
	}
	return snap
}

func snapLink(l *link) linkSnap {
	l.wmu.Lock()
	defer l.wmu.Unlock()
	s := linkSnap{Pending: append([]byte(nil), l.pending...)}
	if len(l.pending) > 0 {
		s.PendingAge = int64(l.pendingAge)
	}
	return s
}

func snapWS(c *wsConn) linkSnap {
	s := snapLink(&c.link)
	s.RBuf = append([]byte(nil), c.unread()...)
	s.MsgOp, s.MsgLen = c.p.msgOp, c.p.msgLen
	return s
}

// commitTo hands the session over: `send` tells the other process to start
// it, and only if that message went out does the session become the other
// process's. Under ss.mu, so nothing (a drain's kick) can end the session
// here between the two. Returns false, with the session thawed and carrying
// on here, if the session is no longer frozen or the message failed.
func (ss *session) commitTo(send func() error) (sent bool, err error) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.state != stFreezing {
		return false, nil
	}
	if err := send(); err != nil {
		ss.thawLocked(stLive)
		return false, err
	}
	ss.state = stHanded
	// The other process holds its own descriptors for these sockets; closing
	// ours sends nothing to either peer.
	for _, l := range ss.links() {
		l.nc.Close()
	}
	ss.cond.Broadcast()
	return true, nil
}

// ---- Adopting (the receiving side) -------------------------------------------

// adopted builds a session from a snapshot and the sockets that came with
// it. Not started: that waits for the sender's commit.
func adoptSession(srv *Server, snap *sessionSnap, conns []net.Conn) (*session, error) {
	cfg := srv.cfg
	want := 2
	if len(conns) != want {
		return nil, fmt.Errorf("%d sockets, want %d", len(conns), want)
	}
	studioTimeout := cfg.StudioWriteTimeout
	if snap.Path == PathHarbor {
		studioTimeout = cfg.HarborWriteTimeout
	}
	ss := newSession(srv, snap.Path, restoreWS(conns[0], false, cfg.MaxMessage, studioTimeout, snap.Studio))
	ss.id = snap.ID
	switch snap.Path {
	case PathHarbor:
		if snap.Up == nil {
			return nil, errors.New("harbor session without its harbor socket")
		}
		ss.up = restoreWS(conns[1], true, cfg.MaxMessage, cfg.HarborWriteTimeout, *snap.Up)
	case PathIcecast:
		if snap.Ice == nil {
			return nil, errors.New("Icecast session without its Icecast socket")
		}
		l := newLink(conns[1], cfg.WriteTimeout)
		restorePending(&l, *snap.Ice)
		ss.ice = &l
	default:
		return nil, fmt.Errorf("unknown path %q", snap.Path)
	}
	ss.lastAudio.Store(snap.LastAudio)
	ss.nextPing.Store(snap.NextPing)
	ss.state = stAdopted
	return ss, nil
}

func restoreWS(nc net.Conn, client bool, maxMessage int64, timeout time.Duration, s linkSnap) *wsConn {
	c := newWSConn(nc, client, maxMessage, timeout, s.RBuf)
	c.p.msgOp, c.p.msgLen = s.MsgOp, s.MsgLen
	restorePending(&c.link, s)
	return c
}

func restorePending(l *link, s linkSnap) {
	if len(s.Pending) > 0 {
		l.owed.Store(true)
		l.pending = s.Pending
		l.pendingAge = time.Duration(s.PendingAge)
	}
}

// startAdopted runs a session the sender has committed: owed bytes first,
// then the readers and timers exactly where the sender stopped them.
func (ss *session) startAdopted() {
	ss.mu.Lock()
	if ss.path == PathHarbor {
		ss.goLiveLocked(ss.harborStudioReader, ss.harborReader)
	} else {
		ss.goLiveLocked(ss.icecastStudioReader, ss.iceWatcher)
	}
	ss.mu.Unlock()
	if ss.track.kicked.Load() {
		ss.kick(nil) // a drain came while this was in flight
	}
}

// discard closes an adopted session that was never committed: closing these
// descriptors sends nothing; the sender still holds its own.
func (ss *session) discard() {
	for _, l := range ss.links() {
		l.nc.Close()
	}
	ss.cancel()
}
