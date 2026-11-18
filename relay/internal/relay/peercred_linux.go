package relay

import (
	"net"
	"syscall"
)

// peerCred is the pid and uid of the process on the other end of uc (for a
// connecting socket: the one that bound the listener).
func peerCred(uc *net.UnixConn) (pid, uid int, err error) {
	rc, err := uc.SyscallConn()
	if err != nil {
		return 0, -1, err
	}
	var cred *syscall.Ucred
	var cerr error
	if err := rc.Control(func(fd uintptr) {
		cred, cerr = syscall.GetsockoptUcred(int(fd), syscall.SOL_SOCKET, syscall.SO_PEERCRED)
	}); err != nil {
		return 0, -1, err
	}
	if cerr != nil {
		return 0, -1, cerr
	}
	return int(cred.Pid), int(cred.Uid), nil
}
