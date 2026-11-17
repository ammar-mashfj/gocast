#!/usr/bin/env bash
# Moves the relay copies onto the binary deploy-native.sh just installed,
# without cutting a live container (Pro) show. Run as root.
#
#   relay-rollover.sh <relay bin dir> <run user> <port>...
#
# Copies that support it (their /healthz reports a "build") roll over BY
# THEMSELVES (relay/internal/relay/rollover.go): each notices the new binary,
# and one at a time it stops taking new studios, hands every live session to
# the other copy (sockets and all: nobody notices, relay/internal/relay/
# handoff.go), and exits; systemd starts the new binary. A copy whose peer
# cannot take sessions (a build from before hand-offs) retires the old way:
# Free studios reconnect, container shows are left to end. This script only
# watches: it waits for every copy to come back on the new build (seconds,
# with hand-offs), reports the ones still carrying a show (old way only), and
# puts the previous binary back if a copy cannot start (the copies already on
# the new build then roll back the same gentle way).
#
# Copies that don't (the first deploy of this feature) are restarted the old
# way, one at a time. Nothing Pro is on the relay before that deploy: Pro
# studios move to it only when LIQUIDSOAP_INGEST_URL is switched, after.
#
# Once every copy is on the new build, the sessions (all on one copy by then)
# are evened out between them: relay_balance.
#
# Exit: 0 every copy on the new build; 10 rolling over, a copy is still
# carrying a container show and will restart when it ends (the old way only);
# 11 stuck: after the whole watch a copy is still not on the new build and
# no show explains it; 1 rolled back.
set -euo pipefail

BIN="$1"; RUN_USER="$2"; shift 2
PORTS=("$@")
WAIT_SECS="${RELAY_ROLLOVER_WAIT:-180}"   # how long to watch before reporting
DOWN_SECS="${RELAY_ROLLOVER_DOWN:-30}"    # unreachable this long = cannot start

as_app() { sudo -u "$RUN_USER" "$@"; }
# relay_health / relay_field / relay_string
source "$(dirname "${BASH_SOURCE[0]}")/relay-health.sh"
health() { relay_health "$1"; }
# field <json> <name>: a scalar from /healthz's flat JSON object.
field() { # a number, boolean or string field, unquoted
  local v; v="$(relay_string "$1" "$2")"
  [[ -n "$v" ]] && echo "$v" || relay_field "$1" "$2"
}
healthy() {
  local i
  for i in $(seq 1 20); do [[ -n "$(health "$1")" ]] && return 0; sleep 0.5; done
  return 1
}

NEW_BUILD="$(sha256sum "$BIN/gocast-relay" | cut -c1-12)"

put_back_previous() {
  # Copied aside, then renamed over: a plain cp onto a binary that systemd
  # is still running fails "Text file busy".
  if [[ -f "$BIN/gocast-relay.prev" ]]; then
    as_app cp -p "$BIN/gocast-relay.prev" "$BIN/.new/gocast-relay" \
      && as_app mv -f "$BIN/.new/gocast-relay" "$BIN/gocast-relay" \
      || echo "  ✗ could not put the previous relay binary back"
  fi
}

# ---- Copies that were not running at all -----------------------------------
# Stopped by hand, failed before this deploy, or a fresh host: nothing would
# start them (only a running copy picks up a new binary), and the watch below
# would take a copy that is simply off for a new binary that cannot start,
# put the previous one back and fail the deploy. Start them; from here on a
# copy that does not come up IS the new binary's fault. A copy systemd is
# restarting right now ("activating": it just exited for the new binary) is
# left alone.
for port in "${PORTS[@]}"; do
  state="$(systemctl is-active "gocast-relay@${port}" 2>/dev/null || true)"
  if [[ "$state" == "inactive" || "$state" == "failed" ]]; then
    echo "  · gocast-relay@${port} was not running ($state): starting it"
    systemctl reset-failed "gocast-relay@${port}" 2>/dev/null || true
    systemctl start "gocast-relay@${port}" || true
  fi
done

# ---- Copies from before self-rollover: the old hard rolling restart --------
# Only a copy that ANSWERS without a "build" is an old one. A copy that does
# not answer is not evidence of anything: a self-rolling copy with nothing on
# is down for a second right after the install (it noticed the new binary and
# restarted), and treating that as "old" would hard-restart the other copy,
# cutting its container shows. Down copies are the watch loop's business.
legacy=0
for port in "${PORTS[@]}"; do
  for _ in $(seq 1 20); do
    h="$(health "$port")"
    [[ -n "$h" ]] && break
    sleep 0.5
  done
  [[ -n "$h" && -z "$(field "$h" build)" ]] && legacy=1
done
if [[ $legacy -eq 1 ]]; then
  echo "  · relay copies predate self-rollover: restarting them one at a time"
  restarted=()
  for port in "${PORTS[@]}"; do
    # || true: a failed restart is judged by the health check below, which
    # rolls back. Under set -e it would end the script before the rollback,
    # with the broken binary left installed.
    systemctl restart "gocast-relay@${port}" || true
    if healthy "$port"; then
      echo "  ✓ gocast-relay@${port} restarted"
      restarted+=("$port")
    else
      echo "  ✗ gocast-relay@${port} did not answer /healthz — putting the previous binary back"
      put_back_previous
      systemctl reset-failed "gocast-relay@${port}" 2>/dev/null || true
      systemctl restart "gocast-relay@${port}" || true
      for done_port in "${restarted[@]}"; do
        healthy "$port" || true
        systemctl restart "gocast-relay@${done_port}" || true
        healthy "$done_port" && echo "  ✓ gocast-relay@${done_port} back on the previous binary"
      done
      exit 1
    fi
    [[ "$port" != "${PORTS[-1]}" ]] && sleep 10
  done
  exit 0
fi

# ---- Self-rollover: watch -----------------------------------------------------
echo "  · new relay build $NEW_BUILD: the copies roll over by themselves, one at a time"
declare -A down=()
end=$((SECONDS + WAIT_SECS))
while :; do
  all_new=1 waiting=""
  for port in "${PORTS[@]}"; do
    h="$(health "$port")"
    if [[ -z "$h" ]]; then
      # Down for a second while systemd restarts it is normal; down for
      # DOWN_SECS is a binary that cannot start.
      all_new=0
      down[$port]=$(( ${down[$port]:-0} + 1 ))
      if (( down[$port] >= DOWN_SECS )); then
        echo "  ✗ gocast-relay@${port} has not answered /healthz for ${DOWN_SECS}s — putting the previous binary back"
        put_back_previous
        systemctl reset-failed "gocast-relay@${port}" 2>/dev/null || true
        systemctl restart "gocast-relay@${port}" || true
        healthy "$port" && echo "  ✓ gocast-relay@${port} back on the previous binary"
        echo "  · copies already on the new build roll back by themselves, keeping their shows"
        exit 1
      fi
      continue
    fi
    down[$port]=0
    # The copy test-ran the new binary before stepping aside for it, and it
    # failed: no copy will ever move onto it, so put the previous one back.
    # Every copy is still serving on its own build at this point.
    blocked="$(relay_string "$h" rollover_blocked)"
    if [[ -n "$blocked" ]]; then
      echo "  ✗ gocast-relay@${port} refuses the new binary: $blocked"
      echo "    putting the previous binary back; every copy kept serving on its own build"
      put_back_previous
      exit 1
    fi
    if [[ "$(field "$h" build)" != "$NEW_BUILD" ]]; then
      all_new=0
      shows="$(field "$h" harbor_active)"
      # Retiring with shows still on is one of two things. Handing them to
      # the other copy (handing_off): seconds, keep watching, the copy is
      # about to restart on the new binary and must be seen to come up. Or
      # waiting for them to end (the old way, when the other copy cannot
      # take them): hours, nothing to watch.
      if [[ "$(field "$h" retiring)" == "true" && "$(field "$h" handing_off)" != "true" && "${shows:-0}" -gt 0 ]]; then
        waiting+=" @${port}:${shows}"
      fi
    fi
  done
  if [[ $all_new -eq 1 ]]; then
    for port in "${PORTS[@]}"; do echo "  ✓ gocast-relay@${port} on build $NEW_BUILD"; done
    relay_balance "${PORTS[@]}" || true
    exit 0
  fi
  if [[ -n "$waiting" ]]; then
    # A copy is keeping container shows on air until they end; the rest
    # follows on its own. Nothing to wait for here.
    for port in "${PORTS[@]}"; do
      h="$(health "$port")"
      echo "  · gocast-relay@${port}: build $(field "$h" build), retiring=$(field "$h" retiring), container shows $(field "$h" harbor_active)"
    done
    echo "  · rolling over: waiting for container show(s) to end on${waiting}; those copies restart by themselves"
    exit 10
  fi
  if (( SECONDS >= end )); then
    echo "  ! relay copies not all on build $NEW_BUILD after ${WAIT_SECS}s:"
    for port in "${PORTS[@]}"; do echo "    @${port}: $(health "$port")"; done
    exit 11
  fi
  sleep 1
done
