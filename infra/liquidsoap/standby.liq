# Standby script. Used when the image runs without a per-station script
# mounted at /station.liq — outputs silence to a no-op dummy sink so the
# container starts cleanly (useful for `docker run gocast/liquidsoap:latest`
# sanity checks during deploy).
#
# Real stations use api/resources/views/liquidsoap/station.liq.blade.php,
# rendered by Laravel and mounted into the container.

settings.log.stdout.set(true)
settings.log.level.set(3)

output.dummy(blank())
