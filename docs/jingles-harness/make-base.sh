#!/bin/bash
# Build base.liq from any station script rendered by LiquidsoapSupervisor
# (e.g. /var/gocast/liq/<slug>.liq): Laravel calls go to a fake API served
# by the harness itself on :9000, and the Icecast/HLS outputs are dropped.
# base.liq embeds dev keys from the rendered file, so it is .gitignored here.
set -e
cd "$(dirname "$0")"
python3 - "$1" <<'PY'
import sys
s=open(sys.argv[1]).read()
s=s.replace('http:\\/\\/host.docker.internal:8000','http:\\/\\/127.0.0.1:9000')
s=s[:s.index('icecast_out = output.icecast(')]+'output.dummy(broadcast_out)\n'
open('base.liq','w').write(s)
PY
echo "base.liq written"
