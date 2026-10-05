#!/bin/bash
T=$1; shift
cd "$(dirname "$0")"; python3 mk2.py $T; chmod 644 $T.liq setup2.sh; mkdir -p d_$T; chmod 777 d_$T
docker run --rm -e TEST=$T "$@" --entrypoint sh -v "$PWD/$T.liq:/p.liq:ro" -v "$PWD/setup2.sh:/setup.sh:ro" -v "$PWD/d_$T:/data" gocast/liquidsoap:latest -c 'sh /setup.sh && liquidsoap /p.liq' 2>&1 | grep -E "t=[0-9]|Error|rror:|line [0-9]+|LIVE|CROSS" | sed 's/^.*\] //'
