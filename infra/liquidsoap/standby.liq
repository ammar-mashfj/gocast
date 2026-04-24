# GoCast standby source — containerized Liquidsoap script.
#
# Feeds Icecast's /standby.mp3 mount. Whenever a broadcaster disconnects,
# Icecast's <fallback-mount> transparently routes listeners here and back
# when they reconnect.
#
# Default source is pure silence (blank()) so the container boots cleanly
# without any asset drops. To play an atmospheric bed instead, see the
# "Swap in a real bed" section of infra/liquidsoap/README.md.

settings.server.telnet.set(false)
settings.log.stdout.set(true)
settings.log.level.set(3)

# Pure silence — always infallible, zero setup. Replace with a real source
# once you've chosen a bed.
standby = blank()

# Source password from the container environment; compose keeps it in sync
# with Icecast's source-password.
ice_password = environment.get("ICECAST_SOURCE_PASSWORD")

output.icecast(
  %mp3(bitrate = 128, samplerate = 44100, stereo = false),
  host        = "icecast",
  port        = 8000,
  password    = ice_password,
  mount       = "/standby.mp3",
  name        = "GoCast standby",
  description = "Standby bed for disconnected broadcasters",
  public      = false,
  standby
)
