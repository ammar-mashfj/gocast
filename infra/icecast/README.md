# Icecast fallback-mount infrastructure

This directory holds the server-side configuration that pairs with the relay's
new disconnect handling. The relay releases the Icecast SOURCE immediately on
WebSocket close; Icecast transparently moves listeners to `/standby.mp3` via
`<fallback-mount>`, so the silence-keepalive hack in the old relay is no
longer needed.

## Files

- `standby.ezstream.xml` — ezstream config that feeds `/standby.mp3`.
  Deploy to `/etc/gocast/standby.xml`. Uses the ezstream 1.0+ schema
  (Ubuntu 22.04 ships 1.0.2).
- The intake points at a one-line playlist at `/etc/gocast/standby.m3u`
  containing the absolute path to the MP3. A playlist (rather than a
  `type="file"` intake) guarantees the stream loops forever via
  `stream_once=0`.
- `gocast-standby.service` — systemd unit that runs ezstream on boot.
  Deploy to `/etc/systemd/system/gocast-standby.service`.
- `icecast.xml.snippet` — the `<mount type="default">` / `<mount type="normal">`
  blocks that need to be merged into the existing `/etc/icecast2/icecast.xml`.
  Also documents the `<sources>` bump.
- The standby audio itself is at `relay/assets/standby.mp3` in the repo root.
  Deploy to `/srv/gocast/standby.mp3`.

## Deploy sequence (first time)

```bash
# On the server
sudo apt install ezstream
sudo useradd --system --home /srv/gocast --shell /usr/sbin/nologin gocast || true
sudo mkdir -p /srv/gocast /etc/gocast
sudo chown gocast:gocast /srv/gocast

# Copy files from the repo (adjust paths to match your deploy workflow)
sudo cp relay/assets/standby.mp3            /srv/gocast/standby.mp3
sudo cp infra/icecast/standby.ezstream.xml  /etc/gocast/standby.xml
sudo cp infra/icecast/gocast-standby.service /etc/systemd/system/
sudo chown gocast:gocast /srv/gocast/standby.mp3
sudo chown root:gocast   /etc/gocast/standby.xml
sudo chmod 640           /etc/gocast/standby.xml

# Write the one-line playlist ezstream reads on loop.
echo '/srv/gocast/standby.mp3' | sudo tee /etc/gocast/standby.m3u >/dev/null
sudo chown root:gocast /etc/gocast/standby.m3u
sudo chmod 644         /etc/gocast/standby.m3u

# Edit the existing /etc/icecast2/icecast.xml manually, merging in the
# blocks from infra/icecast/icecast.xml.snippet. Then:
sudo systemctl reload icecast2

# Start the standby feeder
sudo systemctl daemon-reload
sudo systemctl enable --now gocast-standby
sudo systemctl status gocast-standby
```

## Verify

```bash
curl -s http://localhost:8888/status-json.xsl | jq '.icestats.source'
```

`/standby.mp3` should appear with `listeners: 0`, `server_type: audio/mpeg`,
`hidden: 1`.

## Smoke test

1. Broadcast from the app.
2. Connect a listener with e.g. `mpv http://host:8888/stream/<slug>`.
3. Kill the broadcaster's browser tab.
4. Listener should NOT disconnect. Audio should fade to standby bed within
   a second.
5. Resume broadcasting. Listener seamlessly returns to live audio.

If step 4 or 5 fails, check `/var/log/icecast2/error.log` before deploying
the new relay code.
