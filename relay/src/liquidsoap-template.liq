##
# GoCast station engine — one instance per live station.
#
# Controlled by the Node relay over a Unix domain socket. The relay pushes
# tracks via `q.push annotate:title="...",artist="...":file:///path.mp3` and
# reads state via `q.queue`, `request.on_air`, `request.metadata`, `main.remaining`.
#
# Tokens replaced by the relay before spawn:
#   __SOCKET_PATH__, __ICECAST_HOST__, __ICECAST_PORT__, __ICECAST_PASSWORD__,
#   __MOUNT__, __STATION_NAME__
##

settings.init.daemon.set(false)
settings.log.stdout.set(true)
settings.log.file.set(false)
settings.log.level.set(3)

# Match the Opus output rate so we avoid an internal resample.
settings.frame.audio.samplerate.set(48000)

settings.server.socket.set(true)
settings.server.socket.path.set("__SOCKET_PATH__")
settings.server.socket.permissions.set(0o660)
settings.server.telnet.set(false)

# ── Sources ──
queue = request.queue(id="q")
silence = blank(id="silence")

# ── Pause state ──
paused = ref(false)

server.register(
  "pause",
  description="Pause playback (switch output to silence, keep queue in place)",
  fun (_) -> begin paused := true; "ok" end
)

server.register(
  "resume",
  description="Resume playback from queue",
  fun (_) -> begin paused := false; "ok" end
)

server.register(
  "paused",
  description="Current pause state",
  fun (_) -> if paused() then "true" else "false" end
)

# ── Source graph ──
# When paused, switch to silence without killing the queue's current track.
main = mksafe(switch(
  id="main",
  track_sensitive=false,
  [
    ({not paused()}, queue),
    ({true}, silence)
  ]
))

# ── Output ──
output.icecast(
  %opus(
    bitrate = 128,
    application = "audio",
    samplerate = 48000,
    channels = 2,
    signal = "music",
    frame_size = 20.
  ),
  id = "out",
  host = "__ICECAST_HOST__",
  port = __ICECAST_PORT__,
  password = "__ICECAST_PASSWORD__",
  mount = "__MOUNT__",
  name = "__STATION_NAME__",
  encoding = "UTF-8",
  main
)
