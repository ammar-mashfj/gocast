package relay

import (
	"fmt"
	"io"
	"sort"
	"sync"
	"sync/atomic"
)

// Metrics are exposed in Prometheus text format on the health listener.
type Metrics struct {
	active   atomic.Int64
	accepted atomic.Int64
	bytes    atomic.Int64

	mu     sync.Mutex
	closes map[string]int64
}

func NewMetrics() *Metrics { return &Metrics{closes: map[string]int64{}} }

func (m *Metrics) connOpened()   { m.active.Add(1); m.accepted.Add(1) }
func (m *Metrics) connClosed()   { m.active.Add(-1) }
func (m *Metrics) bytesIn(n int) { m.bytes.Add(int64(n)) }

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
	fmt.Fprintf(w, "relay_connections_active %d\n", m.active.Load())
	fmt.Fprintf(w, "relay_connections_total %d\n", m.accepted.Load())
	fmt.Fprintf(w, "relay_bytes_in_total %d\n", m.bytes.Load())
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
