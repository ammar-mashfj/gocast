#!/usr/bin/env bash
# Flags feature docs whose source files changed since the doc was last verified.
#
# Each docs/features/*.md lists its `sources:` in front matter and carries a
# `fingerprint:` — a hash of those files' contents at verification time. A
# content hash rather than a commit, so it works with uncommitted changes and
# survives rebases.
#
#   scripts/docs-check.sh                 check every feature doc
#   scripts/docs-check.sh --stamp FILE    re-fingerprint FILE after re-verifying it
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"

sources() {
  awk '/^---$/{n++; next} n==1 && /^sources:/{on=1; next} n==1 && on && /^  - /{sub(/^  - /,""); print; next} n==1 && on{on=0}' "$1"
}

fingerprint() {
  local doc="$1" missing=0
  while IFS= read -r f; do
    if [[ ! -f "$f" ]]; then echo "  missing source: $f" >&2; missing=1; fi
  done < <(sources "$doc")
  (( missing )) && return 1
  sources "$doc" | while IFS= read -r f; do printf '%s\0' "$f"; cat "$f"; done | sha256sum | cut -c1-16
}

if [[ "${1:-}" == "--stamp" ]]; then
  doc="${2:?usage: --stamp docs/features/NAME.md}"
  fp="$(fingerprint "$doc")"
  sed -i "0,/^fingerprint:.*/s//fingerprint: $fp/" "$doc"
  echo "stamped $doc ($fp)"
  exit 0
fi

stale=0
for doc in docs/features/*.md; do
  [[ "$(basename "$doc")" == "README.md" ]] && continue
  want="$(awk '/^fingerprint:/{print $2; exit}' "$doc")"
  if ! have="$(fingerprint "$doc")"; then
    echo "BROKEN  $doc"; stale=1; continue
  fi
  if [[ "$want" == "$have" ]]; then
    echo "ok      $doc"
  else
    echo "STALE   $doc"; stale=1
  fi
done
exit $stale
