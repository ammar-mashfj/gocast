# Sourced, not run: reading a relay copy's /healthz from a shell script.
# One place for relay-rollover.sh, setup-native.sh and deploy-native.sh.
#
#   relay_health <port>          the copy's /healthz JSON ("" if it does not answer)
#   relay_field <json> <name>    a number or boolean field (pid, handoff, draining...)
#   relay_string <json> <name>   a string field, whole (build, harbor, rollover_blocked...)
#
# The health port is "1" + the copy's port (8095 → 18095), as the systemd
# unit sets it. /healthz is one flat JSON object; these are just enough to
# read it without jq, which the hosts do not have.

relay_health() { curl -fsS --max-time 1 "http://127.0.0.1:1$1/healthz" 2>/dev/null || true; }
relay_field() { sed -n "s/.*\"$2\":\([^,}\"]*\).*/\1/p" <<<"$1"; }
relay_string() { sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p" <<<"$1"; }
