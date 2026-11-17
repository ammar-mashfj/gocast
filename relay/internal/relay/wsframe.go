package relay

// RFC 6455 framing, kept in the relay rather than in a library for one
// reason: a live connection must be handed to another process at any byte
// (handoff.go). That needs every byte read but not yet used, and every byte
// owed to the peer but not yet written, in the relay's own hands. A library
// keeps both behind its own buffers.
//
// Only what the relay needs: no extensions (permessage-deflate is never
// negotiated, MP3 does not compress), frames forwarded as they come.

import (
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"unicode/utf8"
)

const (
	opContinuation = 0x0
	opText         = 0x1
	opBinary       = 0x2
	opClose        = 0x8
	opPing         = 0x9
	opPong         = 0xA
)

// Close codes. The names follow RFC 6455 §7.4.1.
const (
	StatusNormalClosure   = 1000
	StatusGoingAway       = 1001
	StatusProtocolError   = 1002
	StatusNoStatusRcvd    = 1005 // never on the wire: a close frame without a code
	StatusAbnormalClosure = 1006 // never on the wire: no close frame at all
	StatusPolicyViolation = 1008
	StatusMessageTooBig   = 1009
	StatusInternalError   = 1011
	StatusTLSHandshake    = 1015 // never on the wire
)

// maxControlPayload is RFC 6455's limit for ping, pong and close.
const maxControlPayload = 125

// wsFrame is one frame as read off the wire, payload unmasked. The payload
// points into the reader's buffer: valid until the next readFrame.
type wsFrame struct {
	fin     bool
	op      byte
	msgOp   byte // the message's opcode: op, or for a continuation the opcode it continues
	payload []byte
}

// errTooBig is a message over the connection's limit. The relay answers it
// with close 1009, as the library before it did.
var errTooBig = errors.New("message too big")

// protoError is a peer breaking the protocol. Answered with close 1002.
type protoError struct{ why string }

func (e *protoError) Error() string { return "websocket protocol error: " + e.why }

// frameParser holds the per-connection reading state that has to survive a
// hand-off: a fragmented message in progress and its size so far.
type frameParser struct {
	expectMasked bool  // the server side: client frames must be masked
	maxMessage   int64 // largest data message, over all its frames
	msgOp        byte  // opcode of the fragmented message in progress (0 = none)
	msgLen       int64 // bytes of that message so far
}

// parse takes one frame from the front of buf. n is how many bytes it used;
// n == 0 with a nil error means buf does not hold a whole frame yet. A frame
// whose declared length is already over the limit is refused from its header,
// without waiting for (and buffering) its payload.
func (p *frameParser) parse(buf []byte) (f wsFrame, n int, err error) {
	if len(buf) < 2 {
		return f, 0, nil
	}
	b0, b1 := buf[0], buf[1]
	f.fin = b0&0x80 != 0
	if b0&0x70 != 0 {
		return f, 0, &protoError{"reserved bits set"}
	}
	f.op = b0 & 0x0f
	masked := b1&0x80 != 0
	length := uint64(b1 & 0x7f)
	i := 2
	switch length {
	case 126:
		if len(buf) < 4 {
			return f, 0, nil
		}
		length = uint64(binary.BigEndian.Uint16(buf[2:]))
		i = 4
	case 127:
		if len(buf) < 10 {
			return f, 0, nil
		}
		length = binary.BigEndian.Uint64(buf[2:])
		if length>>63 != 0 {
			return f, 0, &protoError{"length with the high bit set"}
		}
		i = 10
	}

	switch f.op {
	case opClose, opPing, opPong:
		if !f.fin {
			return f, 0, &protoError{"fragmented control frame"}
		}
		if length > maxControlPayload {
			return f, 0, &protoError{"control frame over 125 bytes"}
		}
		f.msgOp = f.op
	case opText, opBinary:
		if p.msgOp != 0 {
			return f, 0, &protoError{"new message before the last one ended"}
		}
		if int64(length) > p.maxMessage {
			return f, 0, errTooBig
		}
		f.msgOp = f.op
	case opContinuation:
		if p.msgOp == 0 {
			return f, 0, &protoError{"continuation with no message to continue"}
		}
		if int64(length) > p.maxMessage-p.msgLen {
			return f, 0, errTooBig
		}
		f.msgOp = p.msgOp
	default:
		return f, 0, &protoError{fmt.Sprintf("unknown opcode %d", f.op)}
	}
	// A browser always masks; anything else on the studio side is not a
	// browser. A masked frame from harbor is unmasked and taken: the relay
	// has no reason to be stricter with harbor than harbor's other clients.
	if p.expectMasked && !masked {
		return f, 0, &protoError{"unmasked frame from the client"}
	}

	var key [4]byte
	if masked {
		if len(buf) < i+4 {
			return f, 0, nil
		}
		copy(key[:], buf[i:i+4])
		i += 4
	}
	if uint64(len(buf)-i) < length {
		return f, 0, nil
	}
	end := i + int(length)
	// The payload is a view into buf, unmasked in place: no copy on the way
	// through the relay (the frame towards the other side is the one copy).
	// Valid until the next parse of the same buffer: callers use or copy it
	// before reading on.
	f.payload = buf[i:end:end]
	if masked {
		maskBytes(key, f.payload)
	}

	// Only now that the whole frame is here does the message state move.
	switch f.op {
	case opText, opBinary:
		if !f.fin {
			p.msgOp, p.msgLen = f.op, int64(length)
		}
	case opContinuation:
		p.msgLen += int64(length)
		if f.fin {
			p.msgOp, p.msgLen = 0, 0
		}
	}
	return f, end, nil
}

// maskBytes XORs b with the key, eight bytes at a time (every studio byte
// goes through it once, unmasking, and every Pro byte twice).
func maskBytes(key [4]byte, b []byte) {
	k32 := binary.LittleEndian.Uint32(key[:])
	k64 := uint64(k32) | uint64(k32)<<32
	i := 0
	for ; i+8 <= len(b); i += 8 {
		binary.LittleEndian.PutUint64(b[i:], binary.LittleEndian.Uint64(b[i:])^k64)
	}
	for ; i < len(b); i++ {
		b[i] ^= key[i&3]
	}
}

// appendFrame encodes one frame onto dst. The client side masks.
func appendFrame(dst []byte, fin bool, op byte, payload []byte, mask bool) []byte {
	b0 := op
	if fin {
		b0 |= 0x80
	}
	var b1 byte
	if mask {
		b1 = 0x80
	}
	n := len(payload)
	switch {
	case n <= 125:
		dst = append(dst, b0, b1|byte(n))
	case n <= 0xffff:
		dst = append(dst, b0, b1|126)
		dst = binary.BigEndian.AppendUint16(dst, uint16(n))
	default:
		dst = append(dst, b0, b1|127)
		dst = binary.BigEndian.AppendUint64(dst, uint64(n))
	}
	if !mask {
		return append(dst, payload...)
	}
	var key [4]byte
	rand.Read(key[:])
	dst = append(dst, key[:]...)
	start := len(dst)
	dst = append(dst, payload...)
	maskBytes(key, dst[start:])
	return dst
}

// closePayload is a close frame's body. 1005 (no code) is an empty body.
func closePayload(code int, reason string) []byte {
	if code == StatusNoStatusRcvd {
		return nil
	}
	reason = truncateUTF8(reason, maxControlPayload-2)
	b := binary.BigEndian.AppendUint16(nil, uint16(code))
	return append(b, reason...)
}

// parseClose reads a close frame's body: its code (1005 when it has none)
// and reason.
func parseClose(p []byte) (code int, reason string, err error) {
	switch {
	case len(p) == 0:
		return StatusNoStatusRcvd, "", nil
	case len(p) == 1:
		return 0, "", &protoError{"close frame of one byte"}
	}
	code = int(binary.BigEndian.Uint16(p))
	if !validWireCloseCode(code) {
		return 0, "", &protoError{fmt.Sprintf("close code %d may not be sent", code)}
	}
	if !utf8.Valid(p[2:]) {
		return 0, "", &protoError{"close reason is not UTF-8"}
	}
	return code, string(p[2:]), nil
}

// validWireCloseCode: the codes a peer may put in a close frame.
func validWireCloseCode(c int) bool {
	switch {
	case c >= 1000 && c <= 1003, c >= 1007 && c <= 1014:
		return true
	case c >= 3000 && c <= 4999:
		return true
	}
	return false
}

func truncateUTF8(s string, max int) string {
	if len(s) <= max {
		return s
	}
	s = s[:max]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s
}

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

func acceptKey(key string) string {
	h := sha1.Sum([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h[:])
}

func newKey() string {
	var b [16]byte
	rand.Read(b[:])
	return base64.StdEncoding.EncodeToString(b[:])
}
