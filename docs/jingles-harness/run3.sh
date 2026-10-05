#!/bin/bash
# The planning script (X-Gocast-Script 2): Laravel serves jingles and trims.
# Render a station script first (LiquidsoapSupervisor::renderLiqFile), then:
#   ./run3.sh /path/to/rendered.liq
# A fake planner (tail3.liq) applies Laravel's clock (now + last airtime) and
# trims the song crossing t=15s with liq_cue_out + liq_fade_out. Prints FETCH
# / ON AIR timings and writes d3/out.wav; measure the fade with e.g.
#   ffmpeg -ss 13.5 -t 0.25 -i d3/out.wav -af volumedetect -f null -
set -e
cd "$(dirname "$0")"
python3 - "$1" <<'PY'
import sys
s=open(sys.argv[1]).read()
s=s.replace('http:\\/\\/host.docker.internal:8000','http:\\/\\/127.0.0.1:9000')
s=s[:s.index('icecast_out = output.icecast(')]
open('base3.liq','w').write(s)
PY
cat base3.liq tail3.liq > t3.liq; chmod 644 t3.liq setup3.sh; mkdir -p d3; chmod 777 d3
docker run --rm --entrypoint sh -v "$PWD/t3.liq:/p.liq:ro" -v "$PWD/setup3.sh:/setup.sh:ro" -v "$PWD/d3:/data" gocast/liquidsoap:latest -c 'sh /setup.sh && liquidsoap /p.liq' 2>&1 | grep -E "t=[0-9]|Error|rror:" | sed 's/^.*\] //'
