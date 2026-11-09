// Package standby keeps Icecast's /standby mount fed with silence, paced at
// real time, forever.
//
// Every station mount falls back to /standby (icecast.xml.tpl), so when a
// source drops — a relay broadcaster's network blip, a relay restart, a Pro
// container being recreated — its listeners move there instead of being
// disconnected, and `fallback-override own` brings them back when it returns.
//
// It has to be a live, paced source rather than Icecast's fallback-to-file:
// Icecast starts a fallback file only for mounts declared by name, and serves
// it as fast as each listener's socket accepts, so a browser buffers minutes
// of silence and comes back late (both found in the relay lab). This is the
// job `ffmpeg -re -stream_loop -1 -c copy` did there, without needing ffmpeg
// on the host: the MP3 is split into frames and each is written when its time
// comes. Nothing is decoded or encoded.
package standby

import (
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"time"
)

// Frame is one MPEG audio frame and how long it plays.
type Frame struct {
	Data     []byte
	Duration time.Duration
}

var (
	bitratesV1L3 = [16]int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0}
	bitratesV2L3 = [16]int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0}
	sampleRates  = map[int][3]int{3: {44100, 48000, 32000}, 2: {22050, 24000, 16000}, 0: {11025, 12000, 8000}}
)

// Frames splits an MP3 (MPEG-1/2/2.5 Layer III, any bitrate) into frames.
// A leading ID3v2 tag and anything that is not a frame header is skipped.
func Frames(b []byte) ([]Frame, error) {
	if len(b) >= 10 && string(b[:3]) == "ID3" {
		size := int(b[6]&0x7f)<<21 | int(b[7]&0x7f)<<14 | int(b[8]&0x7f)<<7 | int(b[9]&0x7f)
		if 10+size <= len(b) {
			b = b[10+size:]
		}
	}
	var frames []Frame
	for i := 0; i+4 <= len(b); {
		n, d, ok := header(b[i : i+4])
		if !ok || i+n > len(b) {
			i++
			continue
		}
		frames = append(frames, Frame{Data: b[i : i+n], Duration: d})
		i += n
	}
	if len(frames) == 0 {
		return nil, errors.New("no MP3 frames found")
	}
	return frames, nil
}

// header decodes a 4-byte Layer III frame header: its length in bytes and
// how long it plays.
func header(h []byte) (int, time.Duration, bool) {
	if h[0] != 0xff || h[1]&0xe0 != 0xe0 {
		return 0, 0, false
	}
	version := int(h[1]>>3) & 3 // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
	layer := int(h[1]>>1) & 3   // 1 = Layer III
	if version == 1 || layer != 1 {
		return 0, 0, false
	}
	brIdx, srIdx, padding := int(h[2]>>4), int(h[2]>>2)&3, int(h[2]>>1)&1
	if srIdx == 3 {
		return 0, 0, false
	}
	bitrate := bitratesV1L3[brIdx]
	samples, coeff := 1152, 144
	if version != 3 {
		bitrate, samples, coeff = bitratesV2L3[brIdx], 576, 72
	}
	if bitrate == 0 {
		return 0, 0, false
	}
	rate := sampleRates[version][srIdx]
	length := coeff*bitrate*1000/rate + padding
	return length, time.Duration(samples) * time.Second / time.Duration(rate), true
}

// Config says where to publish.
type Config struct {
	IcecastAddr string // host:port
	Mount       string // "/standby"
	User        string // "source"
	Password    string
	// Lead is how far ahead of real time the feeder may run. A little lead
	// lets a listener arriving on /standby start without an underrun; more
	// would recreate the unpaced-file problem.
	Lead time.Duration
}

// Run publishes the frames in a loop until ctx ends, reconnecting with a
// capped backoff whenever Icecast drops or refuses the source.
func Run(ctx context.Context, cfg Config, frames []Frame) {
	backoff := time.Second
	for ctx.Err() == nil {
		start := time.Now()
		err := publish(ctx, cfg, frames)
		if ctx.Err() != nil {
			return
		}
		if time.Since(start) > time.Minute {
			backoff = time.Second
		}
		log.Printf("standby source ended: %v; reconnecting in %s", err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 10*time.Second)
	}
}

func publish(ctx context.Context, cfg Config, frames []Frame) error {
	d := net.Dialer{Timeout: 5 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", cfg.IcecastAddr)
	if err != nil {
		return err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()

	host, _, _ := net.SplitHostPort(cfg.IcecastAddr)
	auth := base64.StdEncoding.EncodeToString([]byte(cfg.User + ":" + cfg.Password))
	req := "PUT " + cfg.Mount + " HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Authorization: Basic " + auth + "\r\n" +
		"Content-Type: audio/mpeg\r\n" +
		"Ice-Public: 0\r\n" +
		"Ice-Name: GoCast standby\r\n" +
		"User-Agent: gocast-standby/1\r\n" +
		// Icecast 2.5 answers an accepted PUT only when asked to; see
		// relay.SourceRequest.
		"Expect: 100-continue\r\n" +
		"\r\n"
	conn.SetDeadline(time.Now().Add(10 * time.Second))
	if _, err := io.WriteString(conn, req); err != nil {
		return err
	}
	br := bufio.NewReader(conn)
	status, err := br.ReadString('\n')
	if err != nil {
		return fmt.Errorf("no answer: %w", err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil || line == "\r\n" || line == "\n" {
			break
		}
	}
	if f := strings.Fields(status); len(f) < 2 || (f[1] != "100" && f[1] != "200") {
		return fmt.Errorf("refused: %s", strings.TrimSpace(status))
	}
	conn.SetDeadline(time.Time{})
	log.Printf("standby source on %s%s", cfg.IcecastAddr, cfg.Mount)

	// Wall-clock pacing: each frame is written once the audio before it has
	// had its playing time (minus the lead), so drift never accumulates
	// however long it runs.
	begin := time.Now()
	var played time.Duration
	for {
		for _, f := range frames {
			if wait := time.Until(begin.Add(played - cfg.Lead)); wait > 0 {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(wait):
				}
			}
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := conn.Write(f.Data); err != nil {
				return err
			}
			played += f.Duration
		}
	}
}
