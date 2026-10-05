
# ===================== HARNESS TAIL v2 =====================
t0 = time()
def now() = time() - t0 end
def ts() = string.float(decimal_places=2, now()) end
test = environment.get("TEST")
hard_at = float_of_string(environment.get(default="15.", "HARD"))
expected_end = ref(0.)
nfetch = ref(0)

def item(n) =
  if test == "seq" or test == "seq_cross" then
    if n mod 3 == 0 then ("J#{n}", "/tmp/j2.wav", 2., true, 0., 0.)
    elsif n == 4 then ("S#{n}-cued", "/tmp/s6.wav", 4., false, 1., 5.)
    else ("S#{n}", "/tmp/s6.wav", 6., false, 0., 0.) end
  else
    if n == 2 then ("S#{n}-long", "/tmp/s20.wav", 20., false, 0., 0.)
    elsif n == 3 then ("J-HARD", "/tmp/j2.wav", 2., true, 0., 0.)
    else ("S#{n}", "/tmp/s6.wav", 6., false, 0., 0.) end
  end
end

harbor.http.register(port=9000, method="GET", "/api/internal/next-track", fun (_, response) -> begin
  nfetch := nfetch() + 1
  n = nfetch()
  let (title, path, len, jg, cin, cout) = item(n)
  start = max(now(), expected_end())
  extra = ref("")
  if cout > 0. then extra := ",liq_cue_in=\"#{cin}\",liq_cue_out=\"#{cout}\"" end
  play = ref(len)
  hard = (test == "hard" or test == "hard_live" or test == "hard_fade") and n == 2
  if hard and start + len > hard_at then
    play := hard_at - start
    extra := ",liq_cue_out=\"#{play()}\",liq_fade_out=\"2.\""
  end
  expected_end := start + play()
  log(level=2, "t=#{ts()} FETCH #{n} #{title} predicted_start=#{string.float(decimal_places=2, start)} plays=#{string.float(decimal_places=2, play())}#{extra()}")
  j = if jg then "jingle=\"true\"," else "" end
  response.data("annotate:#{j}title=\"#{title}\"#{extra()}:#{path}")
end)
harbor.http.register(port=9000, method="POST", "/api/internal/harbor-auth", fun (_, response) -> response.data("ok"))
harbor.http.register(port=9000, method="POST", "/api/internal/station-event", fun (_, response) -> response.status_code(204))
harbor.http.register(port=9000, method="POST", "/api/internal/now-playing", fun (_, response) -> response.status_code(204))

output_source.on_track(synchronous=true, fun (m) ->
  log(level=2, "t=#{ts()} ON AIR #{m['title']} jingle=#{m['jingle']} src=#{current_source()}"))
output.dummy(broadcast_out)
thread.run(delay=float_of_string(environment.get(default="30.", "STOP")), shutdown)
