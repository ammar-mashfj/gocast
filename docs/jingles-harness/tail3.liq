
# ===================== HARNESS TAIL v3 (planning script) =====================
t0 = time()
def now() = time() - t0 end
def ts() = string.float(decimal_places=2, now()) end
hard_at = 15.
queued = ref(0.)
nfetch = ref(0)

harbor.http.register(port=9000, method="GET", "/api/internal/next-track", fun (req, response) -> begin
  nfetch := nfetch() + 1
  n = nfetch()
  fresh = list.assoc(default="?", "x-gocast-fresh", req.headers)
  script = list.assoc(default="?", "x-gocast-script", req.headers)
  # Laravel's clock: start = now + airtime of the track handed out last.
  start = if fresh == "1" then now() else now() + queued() end
  let (title, path, len, jg) =
    if n == 1 then ("S1", "/tmp/s6.wav", 6., false)
    elsif n == 2 then ("S2-long", "/tmp/s20.wav", 20., false)
    elsif n == 3 then ("J-HARD", "/tmp/j2.wav", 2., true)
    else ("S#{n}", "/tmp/s6.wav", 6., false) end
  extra = ref("")
  play = ref(len)
  if start + len > hard_at + 0.5 and start < hard_at then
    play := hard_at - start
    extra := ",liq_cue_out=\"#{play()}\",liq_fade_out=\"2.\""
  end
  queued := play()
  log(level=2, "t=#{ts()} FETCH #{n} #{title} fresh=#{fresh} script=#{script} predicted_start=#{string.float(decimal_places=2, start)} plays=#{string.float(decimal_places=2, play())}")
  j = if jg then "jingle=\"true\"," else "" end
  response.data("annotate:#{j}title=\"#{title}\"#{extra()}:#{path}")
end)
harbor.http.register(port=9000, method="POST", "/api/internal/harbor-auth", fun (_, response) -> response.data("ok"))
harbor.http.register(port=9000, method="POST", "/api/internal/station-event", fun (_, response) -> response.status_code(204))
harbor.http.register(port=9000, method="POST", "/api/internal/now-playing", fun (_, response) -> response.status_code(204))

output_source.on_track(synchronous=true, fun (m) ->
  log(level=2, "t=#{ts()} ON AIR #{m['title']} jingle=#{m['jingle']}"))
output.file(%wav, "/data/out.wav", broadcast_out)
thread.run(delay=26., shutdown)
