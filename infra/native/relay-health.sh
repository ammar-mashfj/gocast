# Sourced, not run: reading a relay copy's /healthz from a shell script.
# One place for relay-rollover.sh, setup-native.sh and deploy-native.sh.
#
#   relay_health <port>          the copy's /healthz JSON ("" if it does not answer)
#   relay_field <json> <name>    a number or boolean field (pid, handoff, draining...)
#   relay_string <json> <name>   a string field, whole (build, harbor, rollover_blocked...)
#   relay_balance <port>...      even the sessions out between the copies (SIGUSR2)
#   relay_until <secs> <cmd...>  run cmd every 0.5 s until it succeeds (0) or secs pass (1)
#   relay_up <port>              the copy answers /healthz
#
# The health port is "1" + the copy's port (8095 → 18095), as the systemd
# unit sets it. /healthz is one flat JSON object; these are just enough to
# read it without jq, which the hosts do not have.

relay_health() { curl -fsS --max-time 1 "http://127.0.0.1:1$1/healthz" 2>/dev/null || true; }
relay_field() { sed -n "s/.*\"$2\":\([^,}\"]*\).*/\1/p" <<<"$1"; }
relay_string() { sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p" <<<"$1"; }
relay_up() { [[ -n "$(relay_health "$1")" ]]; }

# The one polling loop every relay script uses.
relay_until() {
  local end=$((SECONDS + $1))
  shift
  until "$@"; do
    (( SECONDS >= end )) && return 1
    sleep 0.5
  done
}

# relay_balance <port>...: after a rollover every session sits on one copy
# (A hands to B, then B hands back to the new A). SIGUSR2 to the copy with
# the most asks it to hand about half to the other (Balance in
# relay/internal/relay/rollover.go). An older build ignores SIGUSR2.
relay_balance() {
  local p h n best="" most=-1
  for p in "$@"; do
    h="$(relay_health "$p")"
    [[ -n "$h" ]] || return 0
    n="$(relay_field "$h" active)"
    if (( n > most )); then most=$n; best=$p; fi
  done
  (( most >= 2 )) || return 0
  systemctl kill --kill-whom=main -s USR2 "gocast-relay@${best}" \
    && echo "  · gocast-relay@${best} carries ${most} session(s): it hands about half to the other copy"
}
