# GoCast Liquidsoap image. One image, used per-station via `docker run`
# (spawned by Laravel's LiquidsoapSupervisor — not docker compose).
#
# Pinned to v2.4.0. DO NOT use :latest — Liquidsoap script syntax
# changes across major versions and an opaque upgrade will break every
# station. Bump deliberately, regenerate all .liq files, restart all
# stations.
FROM savonet/liquidsoap:v2.4.0

# ffmpeg is needed for input.ffmpeg (RTSP pull from MediaMTX) and for
# the AAC encoder used by HLS output. Most savonet images include it
# already; explicit install is cheap insurance.
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
USER liquidsoap

# Default command runs whatever script is mounted at /station.liq.
# When running standalone (no station), use the in-image standby script.
COPY --chown=liquidsoap:liquidsoap standby.liq /standby.liq

ENTRYPOINT ["liquidsoap"]
CMD ["/standby.liq"]
