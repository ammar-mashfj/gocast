package relay

import (
	"fmt"
	"io"
	"sort"
	"sync"
	"sync/atomic"
)

// pathCounters are the per-path numbers: Free (icecast) and container
// (harbor) studios share a relay copy but not their capacity figures.
type pathCounters struct {
	active    atomic.Int64
	accepted  atomic.Int64
	bytes     atomic.Int64
	handedIn  atomic.Int64 // sessions taken from the other copy
	handedOut atomic.Int64 // sessions given to the other copy
}

// Metrics are exposed in Prometheus text format on the health listener.
type Metrics struct {
	icecast pathCounters
	harbor  pathCounters
	// Second and later asks to Icecast for a mount it said was in use.
	busyRetries atomic.Int64

	mu     sync.Mutex
	closes map[string]int64
}

func NewMetrics() *Metrics { return &Metrics{closes: map[string]int64{}} }

func (m *Metrics) path(p string) *pathCounters {
	if p == PathHarbor {
		return &m.harbor
	}
	return &m.icecast
}

func (m *Metrics) connOpened(p string)           { m.path(p).active.Add(1); m.path(p).accepted.Add(1) }
func (m *Metrics) connClosed(p string)           { m.path(p).active.Add(-1) }
func (m *Metrics) handoffIn(p string)            { m.path(p).active.Add(1); m.path(p).handedIn.Add(1) }
func (m *Metrics) handoffOut(p string)           { m.path(p).handedOut.Add(1) }
func (m *Metrics) handedInTotal(p string) int64  { return m.path(p).handedIn.Load() }
func (m *Metrics) handedOutTotal(p string) int64 { return m.path(p).handedOut.Load() }
func (m *Metrics) bytesIn(p string, n int)       { m.path(p).bytes.Add(int64(n)) }
func (m *Metrics) busyRetry()                    { m.busyRetries.Add(1) }
func (m *Metrics) BusyRetries() int64            { return m.busyRetries.Load() }
func (m *Metrics) Bytes(p string) int64          { return m.path(p).bytes.Load() }
func (m *Metrics) acceptedTotal(p string) int64  { return m.path(p).accepted.Load() }
func (m *Metrics) ActiveCount(p string) int64    { return m.path(p).active.Load() }

func (m *Metrics) Close(reason string) {
	m.mu.Lock()
	m.closes[reason]++
	m.mu.Unlock()
}

func (m *Metrics) Closes(reason string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.closes[reason]
}

func (m *Metrics) Render(w io.Writer) {
	for _, p := range []string{PathIcecast, PathHarbor} {
		c := m.path(p)
		fmt.Fprintf(w, "relay_connections_active{path=%q} %d\n", p, c.active.Load())
		fmt.Fprintf(w, "relay_connections_total{path=%q} %d\n", p, c.accepted.Load())
		fmt.Fprintf(w, "relay_bytes_in_total{path=%q} %d\n", p, c.bytes.Load())
		fmt.Fprintf(w, "relay_handoffs_in_total{path=%q} %d\n", p, c.handedIn.Load())
		fmt.Fprintf(w, "relay_handoffs_out_total{path=%q} %d\n", p, c.handedOut.Load())
	}
	fmt.Fprintf(w, "relay_busy_retries_total %d\n", m.busyRetries.Load())
	m.mu.Lock()
	keys := make([]string, 0, len(m.closes))
	for k := range m.closes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Fprintf(w, "relay_closes_total{reason=%q} %d\n", k, m.closes[k])
	}
	m.mu.Unlock()
}
