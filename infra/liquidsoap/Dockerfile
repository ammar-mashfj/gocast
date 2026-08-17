# GoCast Liquidsoap image. One image, used per-station via `docker run`
# (spawned by Laravel's LiquidsoapSupervisor — not docker compose).
#
# Pinned to v2.4.5. DO NOT use :latest — Liquidsoap script syntax
# changes across major versions and an opaque upgrade will break every
# station. Bump deliberately, regenerate all .liq files, restart all
# stations.
#
# Bumped from v2.4.0 because crossfade was unusable on it. savonet#4851
# ("Fix crossfade transition and initial buffer clock", released in 2.4.3)
# attached the crossfade's `transition` and `pre_buffer` sources to the
# passive child clock instead of the top-level one, so nothing animated
# them: AutoDJ wedged on a track boundary and re-emitted one buffered
# frame forever — a static harmonic spectrum that listeners hear as a
# stuck-PC buzz, with elapsed() climbing past the track length,
# remaining() frozen, no decoder End_of_file, and nothing logged.
#
# 2.4.5 also carries savonet#5194, a crash in cross/crossfade when
# source.skip is called from a harbor.http handler or thread.run. This
# image serves /status and /healthz over harbor.http and Laravel polls
# them every couple of seconds, so that one is squarely in our path too.
FROM savonet/liquidsoap:v2.4.5

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
