package relay

import (
	"bytes"
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestFrameRoundTrip(t *testing.T) {
	for _, n := range []int{0, 1, 125, 126, 127, 65535, 65536, 70000} {
		for _, mask := range []bool{false, true} {
			payload := bytes.Repeat([]byte{byte(n)}, n)
			buf := appendFrame(nil, true, opBinary, payload, mask)
			p := frameParser{expectMasked: mask, maxMessage: 1 << 20}
			f, used, err := p.parse(buf)
			if err != nil || used != len(buf) || !bytes.Equal(f.payload, payload) || f.op != opBinary || !f.fin {
				t.Fatalf("n=%d mask=%v: used %d/%d err %v", n, mask, used, len(buf), err)
			}
			// Every proper prefix is "not yet".
			for cut := 0; cut < len(buf); cut += 1 + len(buf)/50 {
				if _, used, err := (&frameParser{expectMasked: mask, maxMessage: 1 << 20}).parse(buf[:cut]); used != 0 || err != nil {
					t.Fatalf("n=%d prefix %d: used %d err %v", n, cut, used, err)
				}
			}
		}
	}
}

func TestFrameParserRefuses(t *testing.T) {
	masked := func(b0 byte, payload []byte) []byte {
		buf := appendFrame(nil, true, b0&0x0f, payload, true)
		buf[0] = b0
		return buf
	}
	cases := map[string]struct {
		buf     []byte
		tooBig  bool
		prepare func(p *frameParser)
	}{
		"unmasked from client":     {buf: appendFrame(nil, true, opBinary, []byte("x"), false)},
		"reserved bit":             {buf: masked(0x80|0x40|opBinary, []byte("x"))},
		"unknown opcode":           {buf: masked(0x80|0x3, []byte("x"))},
		"fragmented ping":          {buf: masked(opPing, []byte("x"))},
		"long ping":                {buf: appendFrame(nil, true, opPing, make([]byte, 126), true)},
		"stray continuation":       {buf: appendFrame(nil, true, opContinuation, []byte("x"), true)},
		"new message mid-fragment": {buf: appendFrame(nil, true, opText, []byte("x"), true), prepare: func(p *frameParser) { p.msgOp = opBinary }},
		"over the limit":           {buf: appendFrame(nil, true, opBinary, make([]byte, 2000), true), tooBig: true},
		"continuation over":        {buf: appendFrame(nil, true, opContinuation, make([]byte, 600), true), tooBig: true, prepare: func(p *frameParser) { p.msgOp, p.msgLen = opBinary, 500 }},
	}
	for name, tc := range cases {
		p := frameParser{expectMasked: true, maxMessage: 1024}
		if tc.prepare != nil {
			tc.prepare(&p)
		}
		_, _, err := p.parse(tc.buf)
		var pe *protoError
		if tc.tooBig && !errors.Is(err, errTooBig) || !tc.tooBig && !errors.As(err, &pe) {
			t.Errorf("%s: err %v", name, err)
		}
	}
	// An oversize frame is refused from its header alone.
	hdr := appendFrame(nil, true, opBinary, make([]byte, 1<<20), true)[:14]
	if _, _, err := (&frameParser{expectMasked: true, maxMessage: 1024}).parse(hdr); !errors.Is(err, errTooBig) {
		t.Fatalf("header of a 1 MB frame: %v", err)
	}
}

func TestFragmentedMessageState(t *testing.T) {
	p := frameParser{expectMasked: true, maxMessage: 100}
	var buf []byte
	buf = appendFrame(buf, false, opBinary, []byte("ab"), true)
	buf = appendFrame(buf, true, opPing, nil, true) // control frames may interleave
	buf = appendFrame(buf, false, opContinuation, []byte("cd"), true)
	buf = appendFrame(buf, true, opContinuation, []byte("ef"), true)
	var got []string
	for len(buf) > 0 {
		f, n, err := p.parse(buf)
		if err != nil || n == 0 {
			t.Fatalf("err %v n %d", err, n)
		}
		buf = buf[n:]
		got = append(got, string([]byte{'0' + f.op, '0' + f.msgOp})+string(f.payload))
	}
	if strings.Join(got, ",") != "22ab,99,02cd,02ef" || p.msgOp != 0 || p.msgLen != 0 {
		t.Fatalf("got %v, state %d/%d", got, p.msgOp, p.msgLen)
	}
}

func TestCloseCodes(t *testing.T) {
	for _, c := range []int{1000, 1001, 1002, 1003, 1007, 1011, 1014, 3000, 4001, 4999} {
		code, reason, err := parseClose(closePayload(c, "why"))
		if err != nil || code != c || reason != "why" {
			t.Errorf("%d: %d %q %v", c, code, reason, err)
		}
	}
	for _, c := range []int{0, 999, 1004, 1005, 1006, 1015, 1016, 2999, 5000} {
		if _, _, err := parseClose([]byte{byte(c >> 8), byte(c)}); err == nil {
			t.Errorf("%d accepted on the wire", c)
		}
	}
	if code, _, err := parseClose(nil); err != nil || code != StatusNoStatusRcvd {
		t.Fatal("empty close is 1005")
	}
	if _, _, err := parseClose([]byte{3}); err == nil {
		t.Fatal("one-byte close accepted")
	}
	long := closePayload(1000, strings.Repeat("é", 100))
	if len(long) > maxControlPayload {
		t.Fatalf("close payload %d bytes", len(long))
	}
	if _, _, err := parseClose(long); err != nil {
		t.Fatalf("truncated reason no longer UTF-8: %v", err)
	}
}

func FuzzFrameParser(f *testing.F) {
	f.Add(appendFrame(nil, true, opBinary, []byte("hello"), true), true)
	f.Add(appendFrame(nil, false, opText, []byte("he"), false), false)
	f.Add([]byte{0x81, 0xff, 0, 0, 0, 0, 0, 0, 0, 1}, true)
	f.Fuzz(func(t *testing.T, buf []byte, masked bool) {
		p := frameParser{expectMasked: masked, maxMessage: 4096}
		for len(buf) > 0 {
			fr, n, err := p.parse(buf)
			if err != nil || n == 0 {
				return
			}
			if n > len(buf) || len(fr.payload) > 4096 {
				t.Fatalf("used %d of %d, payload %d", n, len(buf), len(fr.payload))
			}
			buf = buf[n:]
		}
	})
}

// rawStudio is a hand-made client for the cases a real one never sends.
func rawStudio(t *testing.T, addr, path string) *wsConn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := dialWebSocket(ctx, addr, path, []string{"webcast"}, nil, 1<<20, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.closeNow)
	return c
}

// readClose reads until the relay's close frame and returns its code, or -1.
func (c *wsConn) readCloseCode(t *testing.T) int {
	t.Helper()
	c.nc.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		f, err := c.readFrame()
		if err != nil {
			return -1
		}
		if f.op == opClose {
			code, _, _ := parseClose(f.payload)
			return code
		}
	}
}

func TestStudioProtocolErrorsAreAnswered(t *testing.T) {
	h := newFakeHarbor(t)
	s, hs := startRelay(t, harborConfig(h.addr()))
	addr := strings.TrimPrefix(hs.URL, "http://")
	cases := map[string][]byte{
		"unmasked":       appendFrame(nil, true, opBinary, []byte("x"), false),
		"reserved bit":   func() []byte { b := appendFrame(nil, true, opBinary, []byte("x"), true); b[0] |= 0x20; return b }(),
		"bad close code": appendFrame(nil, true, opClose, []byte{0x03, 0xed}, true), // 1005 may not be sent
	}
	for name, raw := range cases {
		c := rawStudio(t, addr, "/relay/broadcast/a")
		c.nc.Write(raw)
		if got := c.readCloseCode(t); got != StatusProtocolError {
			t.Errorf("%s: close %d, want 1002", name, got)
		}
		h.waitEnd(t)
	}
	eventually(t, "counted", func() bool { return s.Metrics.Closes("harbor_bad_frame") == int64(len(cases)) })
}

func TestStudioPingIsAnswered(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	go c.Read(ctx) // coder/websocket reads the pong on the read side
	if err := c.Ping(ctx); err != nil {
		t.Fatalf("no pong: %v", err)
	}
}

func TestFragmentedStudioMessageReachesHarborWhole(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	c := studio(t, hs, "a")
	ctx := context.Background()
	w, err := c.Writer(ctx, websocket.MessageBinary)
	if err != nil {
		t.Fatal(err)
	}
	for _, part := range []string{"one-", "two-", "three"} {
		w.Write([]byte(part))
	}
	w.Close()
	eventually(t, "message at harbor", func() bool {
		g := h.got("a")
		return len(g) == 1 && string(g[0].data) == "one-two-three" && g[0].typ == websocket.MessageBinary
	})
}

// The relay is a proper client towards harbor: what a strict server (the
// library on the fake harbor) accepts.
func TestUpgradeChecks(t *testing.T) {
	h := newFakeHarbor(t)
	_, hs := startRelay(t, harborConfig(h.addr()))
	for name, hdr := range map[string]string{
		"no version": "GET /relay/broadcast/a HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
		"bad key":    "GET /relay/broadcast/a HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: short\r\n\r\n",
		"post":       "POST /relay/broadcast/a HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nContent-Length: 0\r\n\r\n",
	} {
		nc, err := net.Dial("tcp", strings.TrimPrefix(hs.URL, "http://"))
		if err != nil {
			t.Fatal(err)
		}
		nc.Write([]byte(hdr))
		buf := make([]byte, 64)
		nc.SetReadDeadline(time.Now().Add(2 * time.Second))
		n, _ := nc.Read(buf)
		nc.Close()
		if !bytes.HasPrefix(buf[:n], []byte("HTTP/1.1 4")) {
			t.Errorf("%s: answered %q", name, buf[:n])
		}
	}
	if h.dials.Load() != 0 {
		t.Fatal("harbor dialled for a bad upgrade")
	}
}
