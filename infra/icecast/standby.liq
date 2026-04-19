# GoCast standby source — Liquidsoap script.
#
# Feeds Icecast's /standby.mp3 mount with a looping ambient bed. Icecast is
# configured with <mount type="default"><fallback-mount>/standby.mp3</fallback-mount>
# which transparently routes listeners of any dynamic /stream/<slug> mount
# here whenever the broadcaster's SOURCE disconnects. When the broadcaster
# reconnects, <fallback-override> moves them back to the live stream.
#
# Deployed to: /etc/gocast/standby.liq
# Run by:      /etc/systemd/system/gocast-standby.service (as the gocast user)
# Target:      Liquidsoap 2.0.x (Ubuntu 22.04 ships 2.0.2 via apt)
#
# This config is deliberately minimal: one playlist source, one Icecast
# output. No crossfade, no fallback logic — those come later with Phase 2
# (per-station auto-DJ).

# Silence Liquidsoap's interactive telnet server. Nothing needs to poke at
# it for this use case, and leaving it open bound to localhost is noise.
settings.server.telnet.set(false)

# Write logs to a file so systemd's journal stays readable and we have a
# paper trail when listeners complain about audio quirks.
settings.log.file.set(true)
settings.log.file.path.set("/var/log/gocast/standby.log")
settings.log.stdout.set(true)
settings.log.level.set(3)

# The loop source. A single-entry playlist with mode "normal" plays the
# file top-to-bottom and restarts at the end, forever. Using playlist()
# (not single()) guarantees loop behaviour across 2.0.x versions.
standby = playlist(
  mode         = "normal",
  reload_mode  = "never",
  ["/srv/gocast/standby.mp3"]
)

# Output to local Icecast. Re-encoding to 128 kbps mono MP3 is intentional:
# the standby bed is atmospheric, not musical, and halving the bitrate cuts
# Icecast bandwidth for idle mounts without audible loss.
output.icecast(
  %mp3(bitrate = 128, samplerate = 44100, stereo = false),
  host        = "localhost",
  port        = 8888,
  password    = "06011995",
  mount       = "/standby.mp3",
  name        = "GoCast standby",
  description = "Standby bed for disconnected broadcasters",
  public      = false,
  standby
)
