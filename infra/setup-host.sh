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
# UID 100 / GID 101 = `liquidsoap` user inside savonet/liquidsoap. Liquidsoap
# needs to WRITE the hls/ subdirs; api container runs as root so it can write
# anywhere regardless of ownership. Making the tree owned by 100:101 means
# root-in-api and liquidsoap-in-liquidsoap-container can both write without
# 0777 permissions.
sudo mkdir -p /var/gocast/liq /var/gocast/playlists /var/gocast/hls
sudo chown -R 100:101 /var/gocast
sudo chmod -R 0775 /var/gocast

# --- Docker network ---
# Compose creates `gocast-network` on first `up`; ensure it exists for
# standalone `docker run` invocations from Laravel even if compose hasn't
# started yet. Failure here just means it already exists.
docker network inspect gocast-network >/dev/null 2>&1 || docker network create gocast-network

# --- Liquidsoap image ---
# Built from infra/liquidsoap/Dockerfile. Tagged so Laravel can reference
# `gocast/liquidsoap:latest` when spawning a station.
docker build -t gocast/liquidsoap:latest infra/liquidsoap/

echo "✓ Host setup complete"
echo "  Data dirs: /var/gocast/{liq,playlists,hls}"
echo "  Network:   gocast-network"
echo "  Image:     gocast/liquidsoap:latest"
