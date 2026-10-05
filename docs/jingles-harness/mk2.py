import sys
test=sys.argv[1]
s=open('base.liq').read().replace('output.dummy(broadcast_out)\n','')
if test=='hard_fade':
    s=s.replace('autodj_rotation = fallback(track_sensitive = true, [jingle_arm, autodj])',
      'autodj_rotation = fade.out(track_sensitive=true, duration=0.1, fallback(track_sensitive = true, [jingle_arm, autodj]))')
if 'cross' in test:
    s=s.replace('autodj_faded = autodj_leveled', open('cross.liq').read())
open(f'{test}.liq','w').write(s+open('tail2.liq').read())
