#!/usr/bin/env bash
# Post-deploy smoke test for external encoder ingest.
#
#   bash infra/native/verify-ingest.sh <host> <port> <slug>
#
# The stream key is NOT an argument. It is read from GOCAST_STREAM_KEY, or
# prompted for without echo:
#
#   GOCAST_STREAM_KEY=... bash infra/native/verify-ingest.sh stream.gocast.fm 8010 my-slug
#   bash infra/native/verify-ingest.sh stream.gocast.fm 8010 my-slug   # prompts
#
# It used to be `$4`, and that was wrong for a LONG-LIVED credential: argv is
# world-readable in `ps` for as long as the process runs, and an interactive
# shell writes the whole line to ~/.bash_history, where it outlives every
# rotation. Nothing else in this feature lets the key touch a log — harbor
# refusals omit it, Sentry does not get it, the station timeline records the
# rotation without the value — and a debugging script is a poor place to make
# the one exception.
#
# Exercises the four wire shapes a real libshout client sends, in the order it
# sends them, and says which one broke. Every check here exists because it was
# a bug during implementation — this is the regression suite for a path the PHP
# test suite cannot reach at all.
#
# The station must be SWITCHED ON. All four checks talk to its container.
#
# Nothing here needs libshout installed. If you do have gstreamer, the last
# section streams real audio through the whole chain, which is the only check
# that proves audio actually flows rather than just that the handshake works.

set -uo pipefail

HOST="${1:?usage: verify-ingest.sh <host> <port> <slug>   (key via GOCAST_STREAM_KEY)}"
PORT="${2:?}"
SLUG="${3:?}"

# Fail loudly rather than ignoring it. Anyone re-running the old invocation
# from their history has ALREADY put the key somewhere it should not be, and
# the useful thing to tell them is to rotate it — silently dropping the
# argument would let them keep doing it.
if [[ -n "${4:-}" ]]; then
  echo "!! The stream key is no longer a command-line argument — it ends up in" >&2
  echo "   \`ps\` and in your shell history. Pass it as GOCAST_STREAM_KEY, or" >&2
  echo "   leave it out and this script will prompt for it." >&2
  echo "   The key you just typed is in your history now: rotate it." >&2
  exit 2
fi

# Prompted rather than defaulted, so the script is still usable interactively
# without exporting a credential into the environment of everything else in
# that shell. `read -p` writes the prompt only when stdin is a terminal, so
# `echo "$key" | verify-ingest.sh ...` works too.
KEY="${GOCAST_STREAM_KEY:-}"
if [[ -z "$KEY" ]]; then
  read -r -s -p "Stream key for ${SLUG}: " KEY
  echo
fi
if [[ -z "$KEY" ]]; then
  echo "!! No stream key. Set GOCAST_STREAM_KEY or type it at the prompt." >&2
  exit 2
fi

AUTH="$(printf 'source:%s' "$KEY" | base64 -w0)"
PASS=0
FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ✗ $1"; echo "      got: ${2:-<nothing>}"; FAIL=$((FAIL + 1)); }

send() { timeout 6 nc "$HOST" "$PORT" 2>/dev/null | head -c 400; }

echo "==> 1/4  OPTIONS probe"
# libshout opens EVERY connect with this, on its own connection, to find out
# whether the server accepts PUT. It carries no mount, so it cannot be routed
# to a station — and a connection reset here is fatal to the whole connect:
#
#     shout_open() failed: err=Socket error
#
# Any HTTP response is enough. The router answers it itself, deliberately
# without PUT in the Allow header, so every client stays on the SOURCE path.
OUT="$(printf 'OPTIONS * HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: TLS/1.0, HTTP/1.1\r\n\r\n' "$HOST" | send)"
case "$OUT" in
  HTTP/1.*\ 2*|HTTP/1.*\ 4*) ok "probe answered (encoders will proceed to SOURCE)" ;;
  *) bad "probe was not answered — libshout will fail the whole connect" "$OUT" ;;
esac

echo "==> 2/4  Unauthenticated SOURCE (expect 401)"
# libshout's second connection, sent with no credentials. The 401 and its
# WWW-Authenticate header are the signal it needs to retry WITH them, so this
# failing any other way stops a broadcast before it starts. It looks like a
# refused broadcaster and is not one.
OUT="$(printf 'SOURCE /%s HTTP/1.0\r\nHost: %s\r\nUser-Agent: verify-ingest\r\nContent-Type: audio/mpeg\r\nContent-Length: 0\r\n\r\n' "$SLUG" "$HOST" | send)"
case "$OUT" in
  *401*WWW-Authenticate*|*WWW-Authenticate*) ok "harbor asked for credentials" ;;
  *) bad "expected a 401 with WWW-Authenticate" "$(echo "$OUT" | head -1)" ;;
esac

echo "==> 3/4  Authenticated SOURCE (expect 200)"
OUT="$(printf 'SOURCE /%s HTTP/1.0\r\nAuthorization: Basic %s\r\nHost: %s\r\nUser-Agent: verify-ingest\r\nContent-Type: audio/mpeg\r\n\r\n' "$SLUG" "$AUTH" "$HOST" | send)"
case "$OUT" in
  HTTP/1.*\ 200*) ok "stream key accepted" ;;
  *401*) bad "stream key refused — wrong key, or the owner's plan has no encoder" "$(echo "$OUT" | head -1)" ;;
  "")   bad "no response — is the station switched on?" "" ;;
  *)    bad "unexpected response" "$(echo "$OUT" | head -1)" ;;
esac

echo "==> 4/4  Metadata, in libshout's POST-with-form-body shape"
# THE SHAPE THAT DOES NOT WORK WITHOUT THE ROUTER'S REWRITE. Harbor reads
# `mode`/`mount`/`song` from the query args only and answers this request
# "unrecognised command", so a DJ's track titles never appear. The router turns
# it into the GET harbor parses. A 400 here means that hop is missing or broken
# and every encoder broadcast will show a frozen title.
BODY="mode=updinfo&charset=UTF-8&mount=%2f${SLUG}&song=verify-ingest"
OUT="$(printf 'POST /admin/metadata HTTP/1.1\r\nHost: %s\r\nAuthorization: Basic %s\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: %d\r\n\r\n%s' "$HOST" "$AUTH" "${#BODY}" "$BODY" | send)"
case "$OUT" in
  *"Updated metadatas"*) ok "titles will reach listeners" ;;
  *"unrecognised command"*) bad "the router's metadata rewrite is not in the path" "unrecognised command" ;;
  *401*) bad "metadata refused — harbor authenticates this request too" "$(echo "$OUT" | head -1)" ;;
  *) bad "unexpected response" "$(echo "$OUT" | head -1)" ;;
esac

if command -v gst-launch-1.0 >/dev/null 2>&1 && [[ -n "${GOCAST_AUDIO_TEST:-}" ]]; then
  echo "==> extra  20 seconds of real audio through libshout"
  # gstreamer's shout2send IS libshout — the same library BUTT and Mixxx use —
  # so this exercises the actual client behaviour rather than an approximation.
  # The exit code says nothing useful — `timeout` kills a HEALTHY stream, so
  # non-zero is the normal outcome. What distinguishes a working broadcast from
  # a refused one is whether libshout ever opened the connection.
  #
  # OPT-IN, because this is the one check that cannot keep the key out of
  # `ps`. gst-launch takes its pipeline as argv and shout2send has no other way
  # to be given a password, so for these 25 seconds the credential is readable
  # by any local user. That is a far smaller window than shell history — it
  # does not outlive the process — but it is not nothing, and it should be a
  # decision rather than a surprise on a shared box. Set GOCAST_AUDIO_TEST=1 to
  # take it. The four checks above prove the routing; this one proves audio.
  GST_OUT="$(timeout 25 gst-launch-1.0 -q \
      audiotestsrc ! audioconvert ! lamemp3enc bitrate=128 \
      ! shout2send ip="$HOST" port="$PORT" mount="/$SLUG" \
        password="$KEY" username=source 2>&1)"
  case "$GST_OUT" in
    *"Could not connect"*|*"shout_open"*)
      bad "libshout could not open the stream" "$(echo "$GST_OUT" | grep -m1 -i 'error\|shout_open')" ;;
    *)
      ok "streamed for 20s (the station page should have read Live)" ;;
  esac
elif [[ -n "${GOCAST_AUDIO_TEST:-}" ]]; then
  echo "==> extra  skipped: install gstreamer1.0-plugins-good for a real audio test"
else
  echo "==> extra  skipped: set GOCAST_AUDIO_TEST=1 to stream real audio"
  echo "           (that step puts the key in \`ps\` for 25s — see the comment)"
fi

echo
echo "$PASS passed, $FAIL failed"
exit $(( FAIL > 0 ))
