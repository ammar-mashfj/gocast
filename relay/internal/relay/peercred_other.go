//go:build !linux

package relay

import "net"

// peerCred is Linux-only; elsewhere hand-offs are refused both ways.
func peerCred(uc *net.UnixConn) (pid, uid int, err error) { return 0, -1, ErrNoPeerCred }
