# GoCast Liquidsoap image. One image, used per-station via `docker run`
# (spawned by Laravel's LiquidsoapSupervisor — not docker compose).
#
# Pinned to v2.4.6. DO NOT use :latest — Liquidsoap script syntax
# changes across major versions and an opaque upgrade will break every
# station. Bump deliberately, regenerate all .liq files, restart all
# stations.
#
# 2.4.0 → 2.4.5: crossfade was unusable on 2.4.0 (savonet#4851, fixed in
# 2.4.3), and 2.4.5 carries savonet#5194, a cross/crossfade crash when
# source.skip runs from a harbor.http handler or thread.run.
#
# 2.4.5 → 2.4.6: on 2.4.5 a crossfaded song's title goes blank in /status
# for most of the song (savonet#5360, #5379, fixed in 2.4.6).
#
# Neither upgrade fixed the crossfade freeze on its own: AutoDJ wedged on a
# track boundary and re-emitted one buffered frame forever (a stuck-PC
# buzz, elapsed() climbing past the track length, remaining() frozen,
# nothing logged) on 2.4.5 and 2.4.6 alike. That one was the station
# script calling remaining()/is_ready() on post-cross() sources from the
# harbor HTTP thread — see docs/CROSSFADE-INVESTIGATION.md and the st_*
# refs in station.blade.php.
#
# 2.4.6 does NOT fix the freeze that took unity-radio off air on 2026-11-10
# with crossfade off: a lost wakeup in Liquidsoap's queue lock
# (mutex_utils.ml, unchanged in 2.4.6), set off by is_ready() from /healthz.
# The script is what handles it: no source calls off the clock thread, and
# /healthz fails when the clock stops producing frames.
#
# Rolling back to 2.4.5 is safe for that script: it was soaked on both
# versions (2026-11-11, 14 stations on 2.4.5 for hours under /healthz load,
# no hang), so 2.4.6's #5361 fix is not load-bearing for the st_* callback.
FROM savonet/liquidsoap:v2.4.6

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
