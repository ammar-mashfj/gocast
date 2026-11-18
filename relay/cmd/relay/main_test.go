package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// The test binary doubles as the relay: run with RELAY_TEST_MAIN=1 it is main().
func TestMain(m *testing.M) {
	if os.Getenv("RELAY_TEST_MAIN") == "1" {
		os.Args = append([]string{os.Args[0]}, strings.Fields(os.Getenv("RELAY_TEST_ARGS"))...)
		main()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func freePort(t *testing.T) string {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().String()
}

// A SIGTERM right after a SIGUSR1 still drains at once: the SIGUSR1's
// checks (here the other copy taking 3 s to answer) run off the signal loop
// and never use up systemd's stop window.
func TestSigtermIsNotHeldUpBySigusr1(t *testing.T) {
	slowPeer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(3 * time.Second)
		w.Write([]byte(`{"pid":1}`))
	}))
	defer slowPeer.Close()
	listen, health := freePort(t), freePort(t)
	pidFile := t.TempDir() + "/pid"
	cmd := exec.Command(os.Args[0])
	cmd.Env = append(os.Environ(),
		"RELAY_TEST_MAIN=1",
		"GORACE=atexit_sleep_ms=0", // under -race a process otherwise sleeps 1 s on exit
		"RELAY_ROLLOVER_LOCK="+testLock(),
		"RELAY_HARBOR=",
		"RELAY_PEERS="+strings.TrimPrefix(slowPeer.URL, "http://"),
		"RELAY_TEST_ARGS=-listen "+listen+" -health "+health+" -pid-file "+pidFile,
	)
	out := &strings.Builder{}
	cmd.Stdout, cmd.Stderr = out, out
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Process.Kill()
	for i := 0; i < 100; i++ {
		if b, err := os.ReadFile(pidFile); err == nil && len(b) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if b, _ := os.ReadFile(pidFile); strings.TrimSpace(string(b)) != strconv.Itoa(cmd.Process.Pid) {
		t.Fatalf("relay never came up:\n%s", out)
	}
	cmd.Process.Signal(syscall.SIGUSR1)
	time.Sleep(100 * time.Millisecond)
	start := time.Now()
	cmd.Process.Signal(syscall.SIGTERM)
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case <-done:
		if d := time.Since(start); d > time.Second {
			t.Fatalf("exited %s after SIGTERM", d)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("SIGTERM waited on the SIGUSR1:\n%s", out)
	}
}

// Signals are caught from the start: SIGUSR1 the moment the copy is up
// (setup-native.sh sends it as soon as /healthz answers) and SIGUSR2 never
// kill it. With no other copy both are refused, and the copy runs on.
func TestEarlySignalsDoNotKill(t *testing.T) {
	listen, health := freePort(t), freePort(t)
	pidFile := t.TempDir() + "/pid"
	cmd := exec.Command(os.Args[0])
	cmd.Env = append(os.Environ(),
		"RELAY_TEST_MAIN=1",
		"GORACE=atexit_sleep_ms=0",
		"RELAY_ROLLOVER_LOCK="+testLock(),
		"RELAY_HARBOR=",
		"RELAY_PEERS=127.0.0.1:1", // nobody there
		"RELAY_RETIRE_MAX=1m",
		"RELAY_TEST_ARGS=-listen "+listen+" -health "+health+" -pid-file "+pidFile,
	)
	out := &syncBuf{}
	cmd.Stdout, cmd.Stderr = out, out
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Process.Kill()
	for i := 0; i < 500; i++ {
		if b, err := os.ReadFile(pidFile); err == nil && len(b) > 0 {
			break
		}
		time.Sleep(2 * time.Millisecond)
	}
	// The pid file is written before /healthz answers: the earliest a
	// script could signal.
	cmd.Process.Signal(syscall.SIGUSR1)
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	deadline := time.After(5 * time.Second)
	for !strings.Contains(out.String(), "SIGUSR1 refused") {
		select {
		case err := <-exited:
			t.Fatalf("killed by an early SIGUSR1 (%v):\n%s", err, out)
		case <-deadline:
			t.Fatalf("SIGUSR1 not handled:\n%s", out)
		case <-time.After(50 * time.Millisecond):
		}
	}
	// SIGUSR2 waits for the other copy (up to 30 s): it must just not kill.
	cmd.Process.Signal(syscall.SIGUSR2)
	select {
	case err := <-exited:
		t.Fatalf("killed by SIGUSR2 (%v):\n%s", err, out)
	case <-time.After(time.Second):
	}
	cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-exited:
	case <-time.After(5 * time.Second):
		t.Fatal("no exit on SIGTERM")
	}
}

// A bad RELAY_RETIRE_MAX stops the copy at startup, as a bad flag would.
func TestBadRetireMaxRefused(t *testing.T) {
	cmd := exec.Command(os.Args[0])
	cmd.Env = append(os.Environ(), "RELAY_TEST_MAIN=1", "GORACE=atexit_sleep_ms=0", "RELAY_RETIRE_MAX=soon",
		"RELAY_TEST_ARGS=-listen "+freePort(t)+" -health "+freePort(t))
	out, err := cmd.CombinedOutput()
	if err == nil || !strings.Contains(string(out), "RELAY_RETIRE_MAX") {
		t.Fatalf("started with RELAY_RETIRE_MAX=soon: %v\n%s", err, out)
	}
}

type syncBuf struct {
	mu sync.Mutex
	b  strings.Builder
}

func (s *syncBuf) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuf) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

// testLock is a rollover lock of the test's own: never the host's, which a
// deploy running on the same machine would be using.
func testLock() string {
	return "@gocast-relay-rollover-test-" + strconv.Itoa(os.Getpid()) + "-" + strconv.FormatInt(time.Now().UnixNano(), 10)
}

// -check: every setting checked, nothing bound (the copies hold the ports),
// exit 0; a setting a start would refuse fails it.
func TestCheckMode(t *testing.T) {
	held, err := net.Listen("tcp", "127.0.0.1:0") // a running copy's port
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	run := func(env ...string) (string, error) {
		cmd := exec.Command(os.Args[0])
		cmd.Env = append(append(os.Environ(), "RELAY_TEST_MAIN=1", "GORACE=atexit_sleep_ms=0",
			"RELAY_ROLLOVER_LOCK="+testLock()), env...)
		out, err := cmd.CombinedOutput()
		return string(out), err
	}
	args := "-listen " + held.Addr().String() + " -health " + freePort(t) + " -origins gocast.fm -check"
	if out, err := run("RELAY_TEST_ARGS=" + args); err != nil || !strings.Contains(out, "ok") {
		t.Fatalf("good settings, port in use: %v\n%s", err, out)
	}
	for name, env := range map[string][]string{
		"bad harbor":  {"RELAY_HARBOR=nonsense", "RELAY_TEST_ARGS=" + args},
		"bad origins": {"RELAY_TEST_ARGS=" + strings.Replace(args, "gocast.fm", "https://gocast.fm", 1)},
		"bad listen":  {"RELAY_TEST_ARGS=" + strings.Replace(args, held.Addr().String(), "nowhere", 1)},
		"bad env":     {"RELAY_RETIRE_MAX=soon", "RELAY_TEST_ARGS=" + args},
		"bad flag":    {"RELAY_TEST_ARGS=" + args + " -no-such-flag"},
	} {
		if out, err := run(env...); err == nil {
			t.Errorf("%s: -check passed\n%s", name, out)
		}
	}
}
