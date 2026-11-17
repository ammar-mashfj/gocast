package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strconv"
	"strings"
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
