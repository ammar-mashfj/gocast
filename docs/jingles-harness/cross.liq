autodj_cross_duration = 5.0
autodj_cross_fade = 3.0
autodj_cross_high = -15.0
autodj_cross_medium = -32.0
autodj_cross_margin = 4.0

def autodj_cross_fade_out(s) =
  fade.out(type="sin", duration=autodj_cross_fade, s)
end

def autodj_cross_fade_in(s) =
  fade.in(type="sin", duration=autodj_cross_fade, s)
end

# add() relays metadata from the FIRST available source only, so the incoming
# track is listed first: the other order makes /status announce the track that
# just finished for the whole overlap. normalize=false because add()'s own
# normalization divides by the source count, ducking every transition by 6dB.
def autodj_cross_add(ending, starting) =
  add(normalize=false, [starting, ending])
end

def autodj_cross(a, b) =
  # The fades are built inside each branch, never up front: an unused source
  # still gets created and has to be torn down again.
  #
  # Reading .metadata here also satisfies cross(): it only exposes that field
  # on these records when the script references it, and the type checker needs
  # to see that happen. AzuraCast pokes it with a throwaway `ignore` for
  # exactly this reason — we reference it for real instead.
  if
    # A jingle is never crossfaded. Sliding a produced station ID under the
    # tail of a song is the sound of an accident, and it defeats the point:
    # the ID exists to be heard cleanly. `jingle="true"` is annotated onto
    # every entry in jingles.m3u by PlaylistFileWriter — a station with no
    # jingles never carries it, so this branch is simply never taken there.
    a.metadata["jingle"] == "true" or b.metadata["jingle"] == "true"
  then
    sequence([a.source, b.source])
  elsif
    a.db_level <= autodj_cross_medium
    and b.db_level <= autodj_cross_medium
    and abs(a.db_level - b.db_level) <= autodj_cross_margin
  then
    # Both quiet and close together — safe to fade both ways.
    autodj_cross_add(autodj_cross_fade_out(a.source), autodj_cross_fade_in(b.source))
  elsif
    b.db_level >= a.db_level + autodj_cross_margin
    and a.db_level >= autodj_cross_medium
    and b.db_level <= autodj_cross_high
  then
    # Incoming is much louder — fade the outgoing track out under it.
    autodj_cross_add(autodj_cross_fade_out(a.source), b.source)
  elsif
    a.db_level >= b.db_level + autodj_cross_margin
    and b.db_level >= autodj_cross_medium
    and a.db_level <= autodj_cross_high
  then
    # Outgoing is much louder — fade the incoming track in under it.
    autodj_cross_add(a.source, autodj_cross_fade_in(b.source))
  elsif
    b.db_level >= a.db_level + autodj_cross_margin
    and a.db_level <= autodj_cross_medium
    and b.db_level <= autodj_cross_high
  then
    # Outgoing is already near silence — overlap without fading it further.
    autodj_cross_add(a.source, b.source)
  else
    # Too loud to overlap, or too far apart for one to survive the mix.
    # A hard cut is the honest answer. This is the arm a 0.0 dBFS master
    # takes, which is why the clipping went away.
    sequence([a.source, b.source])
  end
end

autodj_faded = cross(duration=autodj_cross_duration, autodj_cross, autodj_leveled)
