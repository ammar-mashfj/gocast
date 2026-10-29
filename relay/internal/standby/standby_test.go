package standby

import (
	"bufio"
	"bytes"
	"context"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// frame128 builds one MPEG-1 Layer III frame header at 128 kbps / 44.1 kHz,
// padded to its real length (417 bytes, 418 with the padding bit).
func frame128(padding bool) []byte {
	h := []byte{0xff, 0xfb, 0x90, 0x44}
	n := 417
	if padding {
		h[2] |= 0x02
		n = 418
	}
	b := make([]byte, n)
	copy(b, h)
	return b
}

func TestFramesParsesCBR(t *testing.T) {
	var file []byte
	file = append(file, []byte("ID3\x03\x00\x00\x00\x00\x00\x05abcde")...) // a 5-byte ID3v2 tag
	for i := 0; i < 10; i++ {
		file = append(file, frame128(i%3 == 0)...)
	}
	frames, err := Frames(file)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 10 {
		t.Fatalf("got %d frames, want 10", len(frames))
	}
	want := 1152 * time.Second / 44100
	for i, f := range frames {
		if f.Duration != want {
			t.Fatalf("frame %d plays %s, want %s", i, f.Duration, want)
		}
		if f.Data[0] != 0xff {
			t.Fatalf("frame %d does not start on a header", i)
		}
	}
}

func TestFramesRejectsNonMP3(t *testing.T) {
	if _, err := Frames([]byte("this is not audio at all")); err == nil {
		t.Fatal("expected an error")
	}
}

// fakeIcecast accepts one PUT, answers like Icecast 2.5 (100 Continue only if
// asked), and counts the audio bytes it receives.
func fakeIcecast(t *testing.T, accept bool) (addr string, got *atomic.Int64, req chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	got = new(atomic.Int64)
	req = make(chan string, 4)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				br := bufio.NewReader(c)
				var head strings.Builder
				for {
					line, err := br.ReadString('\n')
					if err != nil {
						return
					}
					head.WriteString(line)
					if line == "\r\n" {
						break
					}
				}
				req <- head.String()
				if !accept {
					c.Write([]byte("HTTP/1.1 401 Authentication Required\r\n\r\n"))
					return
				}
				if strings.Contains(head.String(), "Expect: 100-continue") {
					c.Write([]byte("HTTP/1.1 100 Continue\r\n\r\n"))
				}
				buf := make([]byte, 4096)
				for {
					n, err := br.Read(buf)
					got.Add(int64(n))
					if err != nil {
						return
					}
				}
			}(c)
		}
	}()
	return ln.Addr().String(), got, req
}

func TestRunPacesAtRealTime(t *testing.T) {
	addr, got, req := fakeIcecast(t, true)
	var frames []Frame
	for i := 0; i < 50; i++ {
		frames = append(frames, Frame{Data: frame128(false), Duration: 1152 * time.Second / 44100})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	go Run(ctx, Config{IcecastAddr: addr, Mount: "/standby", User: "source", Password: "pw", Lead: 500 * time.Millisecond}, frames)

	head := <-req
	for _, want := range []string{"PUT /standby HTTP/1.1", "Authorization: Basic c291cmNlOnB3", "Expect: 100-continue", "Content-Type: audio/mpeg"} {
		if !strings.Contains(head, want) {
			t.Fatalf("request lacks %q:\n%s", want, head)
		}
	}
	<-ctx.Done()
	time.Sleep(50 * time.Millisecond)

	// 2 s of audio plus the 0.5 s lead at 417 bytes per 26.1 ms ≈ 40 kB.
	// Unpaced it would be every frame in a loop as fast as the socket takes.
	perSecond := 417.0 / (1152.0 / 44100.0)
	want := perSecond * 2.5
	if n := float64(got.Load()); n < want*0.8 || n > want*1.2 {
		t.Fatalf("sent %.0f bytes in 2 s, want about %.0f", n, want)
	}
}

func TestRunRetriesARefusal(t *testing.T) {
	addr, _, req := fakeIcecast(t, false)
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()
	go Run(ctx, Config{IcecastAddr: addr, Mount: "/standby", User: "source", Password: "pw"},
		[]Frame{{Data: bytes.Repeat([]byte{0}, 10), Duration: time.Millisecond}})

	attempts := 0
	for {
		select {
		case <-req:
			attempts++
		case <-ctx.Done():
			if attempts < 2 {
				t.Fatalf("tried %d time(s) in 2.5 s; a refusal must be retried", attempts)
			}
			return
		}
	}
}
