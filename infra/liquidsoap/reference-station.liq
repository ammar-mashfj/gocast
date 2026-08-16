# --- rendered values stand-ins ---
slug = "jazz-247"; api_url = "http://api"; key = "secret"
ice_pw = "sourcepw"; harbor_port = 8080

settings.log.stdout.set(true)
settings.log.level.set(2)
settings.crossfade.assume_autocue := true
settings.prometheus.server := true
settings.prometheus.server.port := 9599

ice_up = ref(false)

def notify(event, extra) =
  ignore(http.post("#{api_url}/api/internal/station-event",
    data=json.stringify({ slug = slug, event = event, detail = extra }),
    headers=[("Content-Type","application/json"), ("X-Internal-Key", key)],
    timeout=5.))
end

on_start(fun () -> notify("boot", ""))
on_shutdown(fun () -> notify("shutdown", ""))

# --- inputs ---
whip_raw = buffer(buffer=2., max=10., input.ffmpeg("rtsp://host:8554/#{slug}/live"))
whip = blank.strip(max_blank=15., threshold=-40., whip_raw)

silence_watch = blank.detect(max_blank=15., threshold=-40., whip_raw)
silence_watch.on_blank(synchronous=false, fun () -> notify("live_silent", ""))
silence_watch.on_noise(synchronous=false, fun () -> notify("live_audio", ""))

enc = input.harbor("#{slug}", port=8000, password=ice_pw,
  on_connect=fun (_) -> notify("encoder_connected", ""),
  on_disconnect=fun () -> notify("encoder_disconnected", ""))

pl = playlist(id="playlist_m3u", "/data/playlists/playlist.m3u",
  mode="normal", reload_mode="never",
  on_fail=fun () -> begin log("no playable track") ; ([] : [string]) end)
autodj = normalize_track_gain(pl)

bed = mksafe(blank())

mixed = mksafe(fallback(track_sensitive=false, [whip, enc, autodj, bed]))
air = mksafe(crossfade(duration=2., mixed))

# --- control + status ---
def authorized(req) = req.headers["x-internal-key"] == key end

harbor.http.register(port=harbor_port, method="GET", "/status", fun (req, response) ->
  if not authorized(req) then response.status_code(403) ; response.data("no")
  else
    response.json({ ready = air.is_ready(), icecast = ice_up(),
                    source = if whip.is_ready() then "live" elsif enc.is_ready() then "encoder"
                             elsif pl.is_ready() then "autodj" else "silence" end,
                    playlist_length = pl.length() })
  end)

harbor.http.register(port=harbor_port, method="POST", "/control", fun (req, response) ->
  if not authorized(req) then response.status_code(403) ; response.data("no")
  else
    if req.query["title"] != "" then mixed.insert_metadata([("title", req.query["title"])]) end
    response.json({ out = server.execute(req.query["cmd"]) })
  end)

# --- outputs ---
o = output.icecast(%mp3(bitrate=128, samplerate=44100), host="icecast", port=8000,
      password=ice_pw, mount="/stream/#{slug}", encoding="UTF-8", air)
o.on_connect(synchronous=false, fun () -> begin ice_up := true ; notify("icecast_connected","") end)
o.on_disconnect(synchronous=false, fun () -> begin ice_up := false ; notify("icecast_disconnected","") end)
o.on_error(synchronous=false, fun (~restart_in, _) -> begin ice_up := false ; restart_in(5.) ; notify("icecast_error","") end)

output.file.hls("/data/hls", segment_duration=2., segments=5, segments_overhead=5,
  persist_at="/data/hls/state.json", playlist="playlist.m3u8",
  [("aac", %ffmpeg(format="mpegts", %audio(codec="aac", b="128k")))], air)

output.file(%mp3(bitrate=128), reopen_when=predicate.changes(fun () -> time.local().hour),
  on_close=fun (f) -> notify("archive_closed", f),
  "/data/hls/archive-%Y%m%d-%H.mp3", air)

lat = prometheus.latency(labels=["station"])
lat(label_values=[slug], air)
