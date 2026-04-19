# Icecast fallback-mount infrastructure

This directory holds the server-side configuration that pairs with the relay's
disconnect handling. The relay releases the Icecast SOURCE immediately on
WebSocket close; Icecast transparently moves listeners to `/standby.mp3` via
`<fallback-mount>`, so listeners stay connected across broadcaster drops and
reconnects.

The `/standby.mp3` mount is fed by **Liquidsoap** running a one-line playlist
loop. An earlier iteration used `ezstream`, but Ubuntu 22.04's `ezstream 1.0.2`
package ships with a known libshout-compatibility bug for MP3 output
([Xiph issue #2271](https://gitlab.xiph.org/xiph/ezstream/-/issues/2271)).
Liquidsoap is both the robust replacement today and the on-ramp to Phase 2
auto-DJ / scheduled-show features — same tool, more features unlocked later.

## Files

- `standby.liq` — Liquidsoap script that loops `/srv/gocast/standby.mp3` into
  the `/standby.mp3` mount at 128 kbps mono MP3. Deploy to
  `/etc/gocast/standby.liq`. Reads its playlist from `/etc/gocast/standby.m3u`
  (a one-line `.m3u` file containing the path to the MP3 — see the deploy
  sequence below).
- `gocast-standby.service` — systemd unit that runs Liquidsoap on boot.
  Deploy to `/etc/systemd/system/gocast-standby.service`.
- `icecast.xml.snippet` — the `<sources>`, `<mount type="default">`, and
  `<mount type="normal">` blocks that must be merged into the existing
  `/etc/icecast2/icecast.xml`. Unchanged from the ezstream-era deploy —
  these are pure Icecast config.
- The standby audio itself is `relay/assets/standby.mp3` in the repo root.
  Deploy to `/srv/gocast/standby.mp3`.

## Deploy sequence (first time)

```bash
# On the server
sudo apt install -y liquidsoap
sudo useradd --system --home /srv/gocast --shell /usr/sbin/nologin gocast || true
sudo mkdir -p /srv/gocast /etc/gocast /var/log/gocast
sudo chown gocast:gocast /srv/gocast /var/log/gocast

# Copy files from the repo (adjust paths to your deploy workflow).
sudo cp relay/assets/standby.mp3             /srv/gocast/standby.mp3
sudo cp infra/icecast/standby.liq            /etc/gocast/standby.liq
sudo cp infra/icecast/gocast-standby.service /etc/systemd/system/
sudo chown gocast:gocast /srv/gocast/standby.mp3
sudo chown root:gocast   /etc/gocast/standby.liq
sudo chmod 640           /etc/gocast/standby.liq

# Write the one-line playlist Liquidsoap reads on loop.
echo '/srv/gocast/standby.mp3' | sudo tee /etc/gocast/standby.m3u >/dev/null
sudo chown root:gocast /etc/gocast/standby.m3u
sudo chmod 644         /etc/gocast/standby.m3u

# Sanity-check the script BEFORE handing it to systemd. This parses the
# config, checks types, and exits without starting the stream. If it errors,
# fix the config and re-run — do not let systemd thrash restarting on a
# broken config.
sudo -u gocast liquidsoap --check /etc/gocast/standby.liq

# Merge the blocks from infra/icecast/icecast.xml.snippet into the existing
# /etc/icecast2/icecast.xml, then:
sudo systemctl reload icecast2

# Start Liquidsoap.
sudo systemctl daemon-reload
sudo systemctl enable --now gocast-standby
sudo systemctl status  gocast-standby --no-pager
```

## Verify

```bash
# The mount should show up with server_type audio/mpeg, hidden:1.
curl -s http://localhost:8888/status-json.xsl | jq '.icestats.source'

# Liquidsoap's own log will confirm it connected to Icecast.
sudo tail -n 30 /var/log/gocast/standby.log
```

## Smoke test

1. Broadcast from the GoCast app.
2. Connect a listener with `mpv http://host:8888/stream/<slug>`.
3. Kill the broadcaster's browser tab.
4. Listener should **not** disconnect. Audio should fade to the standby bed
   within a second or two (Icecast's fallback routing).
5. Resume broadcasting. Listener seamlessly returns to live audio.

If step 4 or 5 fails, check in order:

- `/var/log/gocast/standby.log` — is Liquidsoap connected and publishing?
- `/var/log/icecast2/error.log` — is Icecast accepting the fallback mount?
- `curl http://localhost:8888/status-json.xsl` — does `/standby.mp3` exist
  as an active source?

## Why Liquidsoap over ezstream / ffmpeg

Three reasons, in order of importance:

1. **ezstream 1.0.2 on Ubuntu 22.04 is broken for MP3** — passes `usage=0`
   to `shout_set_content_format()`, which libshout rejects. Would require
   building a patched `.deb` from source.
2. **ffmpeg works but is the wrong shape of tool** — it's a generic media
   processor wearing an Icecast hat. Operationally fine, but a dead-end for
   Phase 2 features (auto-DJ, scheduled shows, crossfades, station IDs).
3. **Liquidsoap is the Phase-2 target anyway** — used by AzuraCast, Libretime,
   and most serious open-source radio platforms. Installing it now for
   standby means the tool is already on the box, already operated, already
   trusted when we expand its role later.

The trade-off is install size (~300 MB with OCaml runtime) and idle RAM
(~50 MB) per VPS. At our scale, these are rounding errors.
