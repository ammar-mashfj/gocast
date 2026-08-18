#!/usr/bin/env bash
# One-time host provisioning for GoCast. Idempotent — safe to run on
# every deploy. Called by deploy.sh.
#
# What this sets up:
#   • Per-station data directories under /var/gocast/
#       liq/        — generated .liq files (one per station)
#       playlists/  — uploaded audio tracks (one subdir per station)
#       hls/        — HLS segments (one subdir per station; Caddy serves)
#   • Ensures the gocast Docker network exists so Liquidsoap containers
#     can reach the icecast and mediamtx services.
#   • Builds the gocast/liquidsoap:latest image so `docker run` is fast
#     when Laravel spawns a station.
#
# Required tools on host: docker, bash. Nothing else.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Per-station data directories ---
# GID 101 = the `liquidsoap` group inside savonet/liquidsoap, and it is the
# constant across every setup: Liquidsoap must WRITE the hls/ subdirs, and it
# runs as uid 100 / gid 101 inside its container. Mode 0775 gives that group
# write access without resorting to 0777.
#
# The OWNER differs by where Laravel runs, which is why it's a variable:
#
#   100 (default)  — Laravel is the containerised api service. Its user is
#                    uid 1001 gid 101 (see api/Dockerfile), so it writes via
#                    the group. Correct for production.
#
#   $(id -u)       — Laravel runs natively on this host. Your user is not in
#                    gid 101, so group-write does not help; you need to own
#                    the tree outright:
#                        GOCAST_DATA_OWNER="$(id -u)" bash infra/setup-host.sh
#                    Liquidsoap containers keep write access through gid 101.
DATA_OWNER="${GOCAST_DATA_OWNER:-100}"

# `system` holds platform-owned audio shared by every station — currently the
# free-tier watermark clip, mounted read-only into each container at
# /data/system. Liquidsoap plays whatever files are in it, so an empty
# directory simply means no watermark; it is never fatal.
sudo mkdir -p /var/gocast/liq /var/gocast/playlists /var/gocast/hls /var/gocast/system
sudo chown -R "${DATA_OWNER}:101" /var/gocast
sudo chmod -R 0775 /var/gocast

# --- Docker network ---
# Compose creates `gocast-network` on first `up`; ensure it exists for
# standalone `docker run` invocations from Laravel even if compose hasn't
# started yet. Failure here just means it already exists.
#
# The labels are not decoration. Compose refuses to adopt a network it
# didn't create — a bare `docker network create gocast-network` here makes
# the next `docker compose up` fail with:
#
#   network gocast-network was found but has incorrect label
#   com.docker.compose.network set to "" (expected: "default")
#
# which is exactly the order deploy.sh runs things in. The two labels below
# are what Compose stamps on its own networks: the project name (`name:` at
# the top of docker-compose.yml) and the network's key in the `networks:`
# block (`default`). With them set, Compose treats this network as its own
# and attaches to it instead of erroring out.
docker network inspect gocast-network >/dev/null 2>&1 || docker network create \
  --label com.docker.compose.project=gocast \
  --label com.docker.compose.network=default \
  gocast-network

# --- Liquidsoap image ---
# Built from infra/liquidsoap/Dockerfile. Tagged so Laravel can reference
# `gocast/liquidsoap:latest` when spawning a station.
docker build -t gocast/liquidsoap:latest infra/liquidsoap/

echo "✓ Host setup complete"
echo "  Data dirs: /var/gocast/{liq,playlists,hls,system}"
echo "  Drop the free-tier watermark clip in /var/gocast/system/ (any audio file)."
echo "  Network:   gocast-network"
echo "  Image:     gocast/liquidsoap:latest"
