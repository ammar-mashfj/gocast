package relay

// Hand-off: a relay copy gives its live sessions to the other copy on the
// same host, sockets and all, and nobody on either end notices.
//
// A session is frozen at whatever byte its sockets are on (session.go,
// wslink.go). The sockets' descriptors go to the other process over a unix
// socket (SCM_RIGHTS), with what the relay itself held for them: bytes read
// but not yet parsed, bytes owed but not yet written, the fragmented message
// in progress, the ping and idle clocks. The other process carries on from
// exactly there. The kernel's own queues travel with the descriptors, and
// the TCP connections themselves never change, so the studio, Icecast and
// harbor see one unbroken connection. The audio pauses for the hand-off
// itself, about a tenth of a millisecond, then catches up from the socket
// buffers.
//
// The exchange, over one connection to the other copy's hand-off socket:
//
//	sender                         receiver
//	hello {v, pid}           →
//	                         ←     welcome {pid}  |  refuse {why}
//	session {state} + fds    →                         (per session)
//	                         ←     ready  |  refuse {why}
//	commit  |  abort         →
//	                         ←     started
//
// Two steps, so the sockets are never run by both processes, or by neither:
// the receiver holds the sockets without touching them until commit; the
// sender stops touching them only once commit has gone out (session.commitTo,
// under the session's lock, so a drain cannot end the session in between).
// A receiver that gets no commit closes its copies, which sends nothing: the
// sender still holds its own. If the commit goes out and the receiver dies
// before acting on it, that session is lost, as it would be if the receiving
// process crashed a moment later.
//
// Who may take sessions: the receiver's socket is an abstract unix socket,
// which any local process could bind first, so the sender checks the peer's
// credentials (same uid, and the pid the other copy's /healthz reported)
// before giving anything away. The receiver checks the sender's uid.

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"syscall"
	"time"
)

// HandoffVersion is the hand-off protocol and session-state format. A copy
// only hands sessions to a copy that speaks the same version (it says so in
// /healthz); otherwise it retires the old way. A change to the state format
// must bump it.
const HandoffVersion = 1

// HandoffPrefix + a copy's health address names the abstract unix socket
// that copy takes sessions on.
var HandoffPrefix = "@gocast-relay-handoff-"

func HandoffSocket(healthAddr string) string { return HandoffPrefix + healthAddr }

// HandoffTarget is the copy a retiring copy hands its sessions to.
type HandoffTarget struct {
	Socket string
	PID    int // the pid its /healthz reported: the socket must be that process's
}

var (
	handoffStep       = 2 * time.Second  // one message each way
	handoffFreezeWait = 2 * time.Second  // every reader parked, or the session stays
	handoffCommitWait = 10 * time.Second // receiver: ready → commit
	handoffIdle       = time.Minute      // receiver: between sessions
)

const handoffMaxMessage = 8 << 20

// Tests only: testHookSnapshot sees every snapshot sent; testHookBeforeLive
// runs as a container session is about to go live.
var (
	testHookSnapshot   func(*sessionSnap)
	testHookBeforeLive func(*session)
)

// sessionSnap is a frozen session, as the receiving process needs it.
type sessionSnap struct {
	V         int       `json:"v"`
	Path      string    `json:"path"`
	ID        string    `json:"id"`
	LastAudio int64     `json:"last_audio"` // unix ns
	NextPing  int64     `json:"next_ping"`  // unix ns
	Studio    linkSnap  `json:"studio"`
	Up        *linkSnap `json:"up,omitempty"`  // harbor path
	Ice       *linkSnap `json:"ice,omitempty"` // Icecast path
}

type linkSnap struct {
	RBuf       []byte `json:"rbuf,omitempty"`
	Pending    []byte `json:"pending,omitempty"`
	PendingAge int64  `json:"pending_age,omitempty"` // ns the owed write had been under way
	MsgOp      byte   `json:"msg_op,omitempty"`
	MsgLen     int64  `json:"msg_len,omitempty"`
}

type hmsg struct {
	T   string       `json:"t"`
	V   int          `json:"v,omitempty"`
	PID int          `json:"pid,omitempty"`
	Why string       `json:"why,omitempty"`
	S   *sessionSnap `json:"s,omitempty"`
}

// writeHmsg sends one message: a marker byte (carrying the descriptors, if
// any, so they arrive with a known byte), a length, the JSON.
func writeHmsg(uc *net.UnixConn, m hmsg, fds []int) error {
	body, err := json.Marshal(m)
	if err != nil {
		return err
	}
	frame := make([]byte, 5, 5+len(body))
	frame[0] = 'M'
	binary.BigEndian.PutUint32(frame[1:], uint32(len(body)))
	frame = append(frame, body...)
	if len(fds) > 0 {
		frame[0] = 'F'
		if _, _, err := uc.WriteMsgUnix(frame[:1], syscall.UnixRights(fds...), nil); err != nil {
			return err
		}
		frame = frame[1:]
	}
	_, err = uc.Write(frame)
	return err
}

// readHmsg reads one message and the descriptors that came with it. The
// caller owns the descriptors (closeFDs if unused).
func readHmsg(uc *net.UnixConn) (hmsg, []int, error) {
	var m hmsg
	mark := make([]byte, 1)
	oob := make([]byte, syscall.CmsgSpace(4*4))
	n, oobn, flags, _, err := uc.ReadMsgUnix(mark, oob)
	if err != nil {
		return m, nil, err
	}
	var fds []int
	if oobn > 0 {
		msgs, perr := syscall.ParseSocketControlMessage(oob[:oobn])
		if perr != nil {
			return m, nil, perr
		}
		for _, cm := range msgs {
			got, err := syscall.ParseUnixRights(&cm)
			if err == nil {
				fds = append(fds, got...)
			}
		}
	}
	fail := func(err error) (hmsg, []int, error) {
		closeFDs(fds)
		return m, nil, err
	}
	if n != 1 || flags&syscall.MSG_CTRUNC != 0 {
		return fail(errors.New("hand-off: truncated message"))
	}
	if (mark[0] == 'F') != (len(fds) > 0) || (mark[0] != 'F' && mark[0] != 'M') {
		return fail(errors.New("hand-off: descriptors and marker disagree"))
	}
	var hdr [4]byte
	if _, err := io.ReadFull(uc, hdr[:]); err != nil {
		return fail(err)
	}
	size := binary.BigEndian.Uint32(hdr[:])
	if size > handoffMaxMessage {
		return fail(fmt.Errorf("hand-off: message of %d bytes", size))
	}
	body := make([]byte, size)
	if _, err := io.ReadFull(uc, body); err != nil {
		return fail(err)
	}
	if err := json.Unmarshal(body, &m); err != nil {
		return fail(err)
	}
	return m, fds, nil
}

func closeFDs(fds []int) {
	for _, fd := range fds {
		syscall.Close(fd)
	}
}

// withFDs runs fn with the descriptors of conns, valid for the call.
func withFDs(conns []net.Conn, fds []int, fn func([]int) error) error {
	if len(conns) == 0 {
		return fn(fds)
	}
	sc, ok := conns[0].(syscall.Conn)
	if !ok {
		return errors.New("socket cannot be handed over")
	}
	rc, err := sc.SyscallConn()
	if err != nil {
		return err
	}
	var ferr error
	if err := rc.Control(func(fd uintptr) { ferr = withFDs(conns[1:], append(fds, int(fd)), fn) }); err != nil {
		return err
	}
	return ferr
}

// fdConns turns received descriptors into connections. Every descriptor is
// closed either way (net.FileConn keeps its own duplicate).
func fdConns(fds []int) ([]net.Conn, error) {
	var conns []net.Conn
	for i, fd := range fds {
		// Through an os.File, closed by it: closing fd by number as well
		// would close whatever reused the number by then.
		f := os.NewFile(uintptr(fd), "handoff")
		c, err := net.FileConn(f)
		f.Close()
		if err == nil {
			if _, ok := c.(*net.TCPConn); !ok {
				c.Close()
				err = errors.New("not a TCP socket")
			}
		}
		if err != nil {
			closeFDs(fds[i+1:])
			for _, c := range conns {
				c.Close()
			}
			return nil, err
		}
		conns = append(conns, c)
	}
	return conns, nil
}

// ---- Receiving ---------------------------------------------------------------

// ListenHandoff takes sessions from the other copy on the abstract socket
// `name` (HandoffSocket of this copy's health address).
func (s *Server) ListenHandoff(name string) (net.Listener, error) {
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: name, Net: "unix"})
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.handoffName = name
	s.mu.Unlock()
	s.handoffUp.Store(true)
	go s.acceptHandoffs(ln)
	return ln, nil
}

type unixAcceptor interface {
	AcceptUnix() (*net.UnixConn, error)
}

// acceptHandoffs runs until the listener is closed. Any other accept error
// (out of descriptors, ...) is waited out: giving up would leave /healthz
// promising hand-offs this copy no longer takes.
func (s *Server) acceptHandoffs(ln unixAcceptor) {
	defer s.handoffUp.Store(false)
	backoff := 5 * time.Millisecond
	for {
		c, err := ln.AcceptUnix()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			s.Logf("hand-off socket: accept: %v (retrying)", err)
			time.Sleep(backoff)
			backoff = min(2*backoff, time.Second)
			continue
		}
		backoff = 5 * time.Millisecond
		go s.receiveHandoffs(c)
	}
}

// TakesHandoffs reports whether this copy's hand-off socket is listening:
// what /healthz advertises to the other copy.
func (s *Server) TakesHandoffs() bool { return s.handoffUp.Load() }

func (s *Server) receiveHandoffs(uc *net.UnixConn) {
	defer uc.Close()
	_, uid, err := peerCred(uc)
	if err != nil || uid != os.Getuid() {
		s.Logf("hand-off: refused a connection from uid %d (%v)", uid, err)
		return
	}
	reply := func(m hmsg) error {
		uc.SetWriteDeadline(time.Now().Add(handoffStep))
		return writeHmsg(uc, m, nil)
	}
	uc.SetReadDeadline(time.Now().Add(handoffStep))
	m, fds, err := readHmsg(uc)
	closeFDs(fds)
	if err != nil || m.T != "hello" {
		return
	}
	switch {
	case m.V != HandoffVersion:
		reply(hmsg{T: "refuse", Why: fmt.Sprintf("hand-off version %d, this copy speaks %d", m.V, HandoffVersion)})
		return
	case s.Draining():
		reply(hmsg{T: "refuse", Why: "draining"})
		return
	}
	if reply(hmsg{T: "welcome", V: HandoffVersion, PID: os.Getpid()}) != nil {
		return
	}
	from := m.PID
	for {
		uc.SetReadDeadline(time.Now().Add(handoffIdle))
		m, fds, err := readHmsg(uc)
		if err != nil {
			return
		}
		if m.T != "session" || m.S == nil {
			closeFDs(fds)
			return
		}
		ss, why := s.adopt(m.S, fds)
		if ss == nil {
			s.Logf("hand-off from pid %d: refused session %s: %s", from, m.S.ID, why)
			if reply(hmsg{T: "refuse", Why: why}) != nil {
				return
			}
			continue
		}
		if reply(hmsg{T: "ready"}) != nil {
			s.dropAdopted(ss)
			return
		}
		uc.SetReadDeadline(time.Now().Add(handoffCommitWait))
		m, fds, err = readHmsg(uc)
		closeFDs(fds)
		if err != nil || m.T != "commit" {
			s.dropAdopted(ss)
			if err != nil {
				return
			}
			continue
		}
		s.Metrics.handoffIn(ss.path)
		ss.startAdopted()
		go func() { s.finish(ss, ss.wait()) }()
		s.Logf("hand-off from pid %d: took session %s", from, ss.name())
		if reply(hmsg{T: "started"}) != nil {
			return
		}
	}
}

// adopt takes a session in, not started. Refused while this copy drains.
func (s *Server) adopt(snap *sessionSnap, fds []int) (*session, string) {
	if snap.V != HandoffVersion {
		closeFDs(fds)
		return nil, fmt.Sprintf("state version %d", snap.V)
	}
	conns, err := fdConns(fds)
	if err != nil {
		return nil, "sockets: " + err.Error()
	}
	ss, err := adoptSession(s, snap, conns)
	if err != nil {
		for _, c := range conns {
			c.Close()
		}
		return nil, err.Error()
	}
	if _, ok := s.track(ss, ss.path); !ok {
		ss.discard()
		return nil, "draining"
	}
	if ss.up != nil {
		s.holdsSource(ss, ss.up.closeNow)
	} else {
		s.holdsSource(ss, ss.ice.closeNow)
	}
	return ss, ""
}

func (s *Server) dropAdopted(ss *session) {
	ss.discard()
	s.untrack(ss)
}

// ---- Sending -----------------------------------------------------------------

func dialHandoff(to HandoffTarget) (*net.UnixConn, error) {
	d := net.Dialer{Timeout: handoffStep}
	c, err := d.Dial("unix", to.Socket)
	if err != nil {
		return nil, err
	}
	uc := c.(*net.UnixConn)
	pid, uid, err := peerCred(uc)
	switch {
	case err != nil:
	case uid != os.Getuid():
		err = fmt.Errorf("%s belongs to uid %d, not this relay's %d", to.Socket, uid, os.Getuid())
	case to.PID != 0 && pid != to.PID:
		err = fmt.Errorf("%s belongs to pid %d, not the other copy (pid %d)", to.Socket, pid, to.PID)
	}
	if err != nil {
		uc.Close()
		return nil, err
	}
	uc.SetDeadline(time.Now().Add(handoffStep))
	if err := writeHmsg(uc, hmsg{T: "hello", V: HandoffVersion, PID: os.Getpid()}, nil); err != nil {
		uc.Close()
		return nil, err
	}
	m, fds, err := readHmsg(uc)
	closeFDs(fds)
	if err == nil && m.T != "welcome" {
		err = fmt.Errorf("the other copy refused: %s", m.Why)
	}
	if err != nil {
		uc.Close()
		return nil, err
	}
	return uc, nil
}

// handOffAll moves every session it can to `to`. Sessions still going live
// (a Free studio's hello and login) are waited for, up to HandoffWindow.
// What is left afterwards is the caller's to retire the old way.
func (s *Server) handOffAll(to HandoffTarget) {
	uc, err := dialHandoff(to)
	if err != nil {
		s.Logf("hand-off: %v; retiring the old way", err)
		return
	}
	defer uc.Close()
	tried := map[*session]bool{}
	deadline := time.Now().Add(s.cfg.HandoffWindow)
	moved := 0
	for {
		var next *session
		waiting := 0
		// The list under s.mu, each session's state outside it: a session
		// can hold its own lock for a while (a Free studio's "ok" going to a
		// slow studio), and s.mu held meanwhile would stall /healthz and
		// every new studio, making this copy look down.
		s.mu.Lock()
		list := make([]*session, 0, len(s.conns))
		for ss := range s.conns {
			if !tried[ss] {
				list = append(list, ss)
			}
		}
		s.mu.Unlock()
		for _, ss := range list {
			ss.mu.Lock()
			live := ss.state == stLive
			ss.mu.Unlock()
			if live {
				next = ss
				break
			}
			waiting++
		}
		if next == nil {
			if waiting == 0 || time.Now().After(deadline) {
				s.Logf("hand-off: %d session(s) moved to pid %d, %d left here", moved, to.PID, s.Active())
				return
			}
			time.Sleep(50 * time.Millisecond)
			continue
		}
		tried[next] = true
		ok, peerOK := s.handOffOne(uc, next)
		if ok {
			moved++
		}
		if !peerOK {
			s.Logf("hand-off: the other copy stopped answering; %d moved, %d left here", moved, s.Active())
			return
		}
	}
}

// handOffOne moves one session. ok: it moved. peerOK: false when the
// connection to the other copy can no longer be trusted (stop handing off).
func (s *Server) handOffOne(uc *net.UnixConn, ss *session) (ok, peerOK bool) {
	t0 := time.Now()
	links := ss.links()
	conns := make([]net.Conn, len(links))
	for i, l := range links {
		if _, ok := l.nc.(syscall.Conn); !ok {
			return false, true
		}
		conns[i] = l.nc
	}
	if !ss.freeze(handoffFreezeWait) {
		return false, true // ended, or not parked in time: it stays here
	}
	snap := ss.snapshot()
	if snap == nil {
		return false, true // ended between the freeze and here: it stays here, ending
	}
	if testHookSnapshot != nil {
		testHookSnapshot(snap)
	}
	step := func() { uc.SetDeadline(time.Now().Add(handoffStep)) }
	step()
	err := withFDs(conns, nil, func(fds []int) error { return writeHmsg(uc, hmsg{T: "session", S: snap}, fds) })
	if err != nil {
		ss.unfreeze()
		s.Logf("hand-off %s: %v; it stays here", ss.name(), err)
		return false, false
	}
	step()
	m, fds, err := readHmsg(uc)
	closeFDs(fds)
	if err != nil || m.T != "ready" {
		ss.unfreeze()
		why := m.Why
		if err != nil {
			why = err.Error()
		}
		s.Logf("hand-off %s: the other copy did not take it (%s); it stays here", ss.name(), why)
		return false, err == nil && m.T == "refuse" && m.Why != "draining"
	}
	step()
	sent, err := ss.commitTo(func() error { return writeHmsg(uc, hmsg{T: "commit"}, nil) })
	if err != nil {
		s.Logf("hand-off %s: commit not sent (%v); it stays here", ss.name(), err)
		return false, false
	}
	if !sent { // ended while frozen (a drain): the other copy lets its copies go
		step()
		return false, writeHmsg(uc, hmsg{T: "abort"}, nil) == nil
	}
	pause := time.Since(t0)
	s.handedOff(ss)
	step()
	m, fds, err = readHmsg(uc)
	closeFDs(fds)
	if err != nil || m.T != "started" {
		s.Logf("hand-off %s: committed but the other copy did not confirm (%v)", ss.name(), err)
		return true, false
	}
	s.Logf("hand-off %s: moved to the other copy, %s paused (owed: studio %dB/%dB)",
		ss.name(), pause.Round(time.Microsecond), len(snap.Studio.RBuf), len(snap.Studio.Pending))
	return true, true
}

// ErrNoPeerCred: this platform cannot tell who is on the other end of a unix
// socket, so hand-offs are off.
var ErrNoPeerCred = errors.New("peer credentials unavailable on this platform")
