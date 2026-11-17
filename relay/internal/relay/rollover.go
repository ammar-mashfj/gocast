package relay

// Rollover: how a relay copy moves to a new binary without anyone noticing.
//
// A deploy only renames the new binary into place. Each copy notices its
// binary on disk no longer matches the one it is running, and retires
// itself (Server.RetireVia): new studios go to the other copy, and every
// live session is handed to the other copy, sockets and all (handoff.go).
// Then the process exits and systemd (Restart=always) starts the new
// binary. The other copy then does the same, back onto the new one.
//
// When the other copy cannot take sessions (a build from before hand-offs,
// or a hand-off that fails), the copy retires the way it did before: Free
// studios are told to reconnect (1001), container shows are left to end on
// their own, for up to MaxWait.
//
// Two rules keep a studio always able to connect somewhere:
//   - a copy retires only while another copy answers /healthz and is not
//     draining or retiring itself, and
//   - only one copy on the host retires at a time: it holds an abstract
//     unix socket (a host-wide lock that needs no file and is released when
//     the process exits, however it exits).
//
// A rollback is the same move in the other direction: putting the previous
// binary back makes the copies that run the new one stale again.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// RolloverLockName is the abstract socket held by the copy that is retiring.
const RolloverLockName = "@gocast-relay-rollover"

// Health is what /healthz reports, and what a copy reads from its peers.
type Health struct {
	PID           int    `json:"pid"`
	Active        int    `json:"active"`
	IcecastActive int    `json:"icecast_active"`
	HarborActive  int    `json:"harbor_active"`
	Draining      bool   `json:"draining"`
	Retiring      bool   `json:"retiring"`
	Stale         bool   `json:"stale"`
	Build         string `json:"build"`
	// Why this copy will not move onto the binary on disk ("" = it would):
	// the new binary failed its test run. The deploy reads it and puts the
	// previous binary back.
	RolloverBlocked string `json:"rollover_blocked"`
	// The hand-off version this copy takes sessions with (0 = it does not).
	Handoff int `json:"handoff"`
	// Retiring and still moving its sessions to the other copy (seconds).
	// A copy retiring without it carries shows it waits for to end.
	HandingOff bool `json:"handing_off"`
	// Where container studios are passed through to (the station router),
	// "" when the pass-through is off. The deploy checks it answers.
	Harbor string `json:"harbor"`
}

// Rollover watches this copy's binary and decides when to retire.
type Rollover struct {
	ExePath    string        // the binary as systemd starts it
	Peers      []string      // other copies' health addresses (host:port)
	CheckEvery time.Duration // how often to look at the binary and the peers
	MaxWait    time.Duration // longest a retiring copy waits for container shows
	LockName   string        // RolloverLockName; tests use their own
	// This process's pid: a peer address that turns out to be this very
	// copy (localhost vs 127.0.0.1, a typo in RELAY_PEERS) is never taken
	// for the other one. 0 = no check (tests, which share one pid).
	SelfPID int

	build string // sha256 of the binary this process started from

	mu      sync.Mutex
	lastMod time.Time
	lastSz  int64
	stale   bool

	// The test run of the binary on disk, cached per file (size+mtime) so a
	// broken build is run once, not every CheckEvery.
	testedMod time.Time
	testedSz  int64
	blocked   string

	// The lock, once taken. Kept on the struct, which lives as long as the
	// process, so the garbage collector can never close it: a closed
	// listener would let the other copy retire at the same time.
	held net.Listener
	// The copy to hand sessions to, chosen with the lock held (nil: the
	// ready copy cannot take them).
	target *HandoffTarget
}

// NewRollover is for a process running the binary at exePath: its build is
// that file's hash. (Tests; the relay itself uses NewRolloverForSelf.)
func NewRollover(exePath string) (*Rollover, error) { return newRollover(exePath, exePath) }

// NewRolloverForSelf takes this process's build from the program it is
// actually running (/proc/self/exe: the executed file, even after a deploy
// has renamed another over its path), not from whatever is at exePath now.
// A copy that restarts just as a deploy swaps the binary would otherwise
// claim the new build while running the old code: the deploy would report
// it rolled over, and nothing would ever move it.
func NewRolloverForSelf(exePath string) (*Rollover, error) {
	running := "/proc/self/exe"
	if _, err := os.Stat(running); err != nil {
		running = exePath // not Linux
	}
	return newRollover(exePath, running)
}

func newRollover(exePath, runningPath string) (*Rollover, error) {
	build, _, err := hashFile(runningPath)
	if err != nil {
		return nil, err
	}
	onDisk, fi, err := hashFile(exePath)
	if err != nil {
		return nil, err
	}
	return &Rollover{
		ExePath:    exePath,
		CheckEvery: 5 * time.Second,
		MaxWait:    12 * time.Hour,
		LockName:   RolloverLockName,
		build:      build,
		lastMod:    fi.ModTime(),
		lastSz:     fi.Size(),
		stale:      onDisk != build, // already replaced since this process started
	}, nil
}

// Build is a short id of the running binary (the deploy compares it with
// the file it installed).
func (r *Rollover) Build() string { return r.build[:12] }

// Stale reports whether the binary on disk differs from the running one.
// The file is re-hashed only when its size or modification time moved.
func (r *Rollover) Stale() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	fi, err := os.Stat(r.ExePath)
	if err != nil {
		// Mid-rename, or removed: say nothing has changed rather than act
		// on a half-installed binary.
		return r.stale
	}
	if fi.ModTime().Equal(r.lastMod) && fi.Size() == r.lastSz {
		return r.stale
	}
	h, fi2, err := hashFile(r.ExePath)
	if err != nil {
		return r.stale
	}
	r.lastMod, r.lastSz = fi2.ModTime(), fi2.Size()
	r.stale = h != r.build
	return r.stale
}

func hashFile(path string) (string, os.FileInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", nil, err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return "", nil, err
	}
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", nil, err
	}
	return hex.EncodeToString(h.Sum(nil)), fi, nil
}

// anyPeerReady reports whether some other copy can take the studios this one
// would turn away: it answers /healthz and is neither draining nor retiring.
func (r *Rollover) anyPeerReady(ctx context.Context) bool {
	_, ok := r.readyPeer(ctx)
	return ok
}

// readyPeer is the first ready copy, and where it takes hand-offs (nil when
// it does not speak this copy's hand-off version).
func (r *Rollover) readyPeer(ctx context.Context) (*HandoffTarget, bool) {
	for _, p := range r.Peers {
		if h, ok := peerReady(ctx, p); ok && (r.SelfPID == 0 || h.PID != r.SelfPID) {
			if h.Handoff != HandoffVersion {
				return nil, true
			}
			return &HandoffTarget{Socket: HandoffSocket(p), PID: h.PID}, true
		}
	}
	return nil, false
}

func peerReady(ctx context.Context, addr string) (Health, bool) {
	var h Health
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+addr+"/healthz", nil)
	if err != nil {
		return h, false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return h, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return h, false
	}
	if err := json.NewDecoder(resp.Body).Decode(&h); err != nil {
		return h, false
	}
	return h, !h.Draining && !h.Retiring
}

// TryLock takes the host-wide rollover lock. The returned listener is the
// lock: closing it, or the process ending, releases it.
func (r *Rollover) TryLock() (net.Listener, bool) {
	ln, err := net.Listen("unix", r.LockName)
	if err != nil {
		return nil, false
	}
	return ln, true
}

// TestRun is how a copy checks the binary on disk before it steps aside for
// it: run with -help, it must exit 0 within TestRunTimeout. Every build of
// the relay, old or new, answers -help that way without binding anything,
// so a rollback to an older binary is checked the same way. It catches a
// binary that cannot start at all (a bad build, wrong architecture); one
// that starts and then fails is caught by the deploy watching /healthz.
var TestRunTimeout = 5 * time.Second

func testRun(path string) error {
	ctx, cancel := context.WithTimeout(context.Background(), TestRunTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, path, "-help").CombinedOutput()
	if ctx.Err() != nil {
		return fmt.Errorf("no answer to -help in %s", TestRunTimeout)
	}
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if len(msg) > 120 {
			msg = msg[:120]
		}
		return fmt.Errorf("%v: %s", err, msg)
	}
	return nil
}

// Blocked reports why this copy refuses the binary on disk ("" if it
// would take it). The test run happens once per file.
func (r *Rollover) Blocked() string {
	if !r.Stale() {
		return ""
	}
	r.mu.Lock()
	mod, sz := r.lastMod, r.lastSz
	if mod.Equal(r.testedMod) && sz == r.testedSz {
		defer r.mu.Unlock()
		return r.blocked
	}
	r.mu.Unlock()
	blocked := ""
	if err := testRun(r.ExePath); err != nil {
		blocked = "new binary failed its test run: " + err.Error()
	}
	r.mu.Lock()
	r.testedMod, r.testedSz, r.blocked = mod, sz, blocked
	r.mu.Unlock()
	return blocked
}

// BlockedSoFar is Blocked without ever running the test itself: what the
// last test run found, if it was of the binary on disk now, else "". For
// /healthz, which must answer at once: the test can take TestRunTimeout,
// longer than the deploy's and the other copy's health checks wait. Run (via
// Begin) tests every new binary within CheckEvery.
func (r *Rollover) BlockedSoFar() string {
	if !r.Stale() {
		return ""
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.lastMod.Equal(r.testedMod) && r.lastSz == r.testedSz {
		return r.blocked
	}
	return ""
}

// Begin decides whether this copy may retire now and, if so, takes the lock
// for the rest of the process's life. It returns why not otherwise. Both
// the automatic rollover (onlyIfStale) and a manual SIGUSR1 go through it,
// so neither can retire alongside the other copy.
func (r *Rollover) Begin(ctx context.Context, srv *Server, onlyIfStale bool) (string, bool) {
	r.mu.Lock()
	taken := r.held != nil
	r.mu.Unlock()
	switch {
	case taken || srv.Draining():
		return "already retiring", false
	case onlyIfStale && !r.Stale():
		return "binary unchanged", false
	}
	if why := r.Blocked(); why != "" {
		return why, false
	}
	lock, ok := r.TryLock()
	if !ok {
		return "the other copy is retiring", false
	}
	// The other copy is asked with the lock held: it cannot start retiring
	// itself from here on, so what it answers now still holds while this
	// copy retires.
	target, ready := r.readyPeer(ctx)
	if !ready {
		lock.Close()
		return "no other copy ready to take new studios", false
	}
	r.mu.Lock()
	r.held = lock
	r.target = target
	r.mu.Unlock()
	return "", true
}

// Target is where Begin found the other copy taking hand-offs (nil: retire
// the old way).
func (r *Rollover) Target() *HandoffTarget {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.target
}

// Run checks every CheckEvery until ctx ends or this copy retires. It
// returns true once srv has retired (every studio gone): the caller exits.
// The lock stays held until the process exits, so the other copy cannot
// start retiring before this one is back.
func (r *Rollover) Run(ctx context.Context, srv *Server, logf func(string, ...any)) bool {
	t := time.NewTicker(r.CheckEvery)
	defer t.Stop()
	lastLogged := "" // the last "not moving" reason logged: each new one is said once
	for {
		select {
		case <-ctx.Done():
			return false
		case <-t.C:
		}
		why, ok := r.Begin(ctx, srv, true)
		if !ok {
			// Said once per reason, not every few seconds.
			if strings.HasPrefix(why, "new binary failed") && why != lastLogged {
				lastLogged = why
				logf("NOT moving to the binary on disk, keeping this build: %s", why)
			}
			continue
		}
		if t := r.Target(); t != nil {
			logf("binary on disk changed: handing %d session(s) to the other copy (pid %d), then exiting for the new binary",
				srv.Active(), t.PID)
		} else {
			logf("binary on disk changed; the other copy cannot take sessions: retiring (%d Free studio(s) told to reconnect, waiting up to %s for %d container show(s))",
				srv.ActiveOn(PathIcecast), r.MaxWait, srv.ActiveOn(PathHarbor))
		}
		srv.RetireVia(r.MaxWait, r.Target())
		logf("retired: every studio gone, exiting for the new binary")
		return true
	}
}

// Held is the lock while this copy retires (nil before). The caller keeps
// it reachable until exit; see the held field.
func (r *Rollover) Held() net.Listener {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.held
}
