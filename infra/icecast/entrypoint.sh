#!/bin/sh
# Icecast entrypoint — renders the config template with env secrets at
# container start, then execs icecast as PID 1.
#
# Writes to /tmp because the container runs as the non-root `icecast` user
# which doesn't own /etc. /tmp is always writable by any user and its
# contents vanish on container restart, which is exactly what we want for
# a file that's regenerated on every boot anyway.
#
# `envsubst` is limited to exactly the vars we substitute so any literal `$`
# elsewhere in the XML (there shouldn't be any, but defense in depth) is
# preserved byte-for-byte.
set -eu

: "${ICECAST_SOURCE_PASSWORD:?ICECAST_SOURCE_PASSWORD must be set}"
: "${ICECAST_RELAY_PASSWORD:?ICECAST_RELAY_PASSWORD must be set}"
: "${ICECAST_ADMIN_USER:?ICECAST_ADMIN_USER must be set}"
: "${ICECAST_ADMIN_PASSWORD:?ICECAST_ADMIN_PASSWORD must be set}"

envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_RELAY_PASSWORD} ${ICECAST_ADMIN_USER} ${ICECAST_ADMIN_PASSWORD}' \
    < /etc/icecast.xml.tpl \
    > /tmp/icecast.xml

exec icecast -c /tmp/icecast.xml -n
