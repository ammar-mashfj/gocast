package relay

import "testing"

func BenchmarkMaskedFrame(b *testing.B) {
	payload := make([]byte, 4096)
	var buf []byte
	b.SetBytes(int64(len(payload)))
	for b.Loop() {
		buf = appendFrame(buf[:0], true, opBinary, payload, true)
	}
}

// maskBytes against the byte-at-a-time definition, at every length and
// offset into the key.
func TestMaskBytesMatchesTheDefinition(t *testing.T) {
	key := [4]byte{0x12, 0x9a, 0xff, 0x01}
	for n := 0; n < 70; n++ {
		b := make([]byte, n)
		for i := range b {
			b[i] = byte(i * 7)
		}
		got := append([]byte(nil), b...)
		maskBytes(key, got)
		for i := range b {
			if got[i] != b[i]^key[i&3] {
				t.Fatalf("n=%d byte %d", n, i)
			}
		}
	}
}
