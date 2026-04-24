# Liquidsoap standby container

Feeds Icecast's `/standby.mp3` mount. Whenever a broadcaster disconnects,
Icecast's `<fallback-mount>` transparently routes listeners here and back
when they reconnect.

## Default behaviour

Out of the box, the container publishes **pure silence** — no asset drops
required, the stack boots on `docker compose up` with nothing else to set up.

## Swap in a real bed

Ambient is better than musical — it's meant to sit under "the stream is
reconnecting" without drawing attention.

1. Drop an MP3 at `infra/liquidsoap/standby.mp3`.
2. Edit `docker-compose.yml` under the `liquidsoap:` service `volumes:` and
   mount the file into the container:
   ```yaml
   - ./infra/liquidsoap/standby.mp3:/etc/liquidsoap/standby.mp3:ro
   ```
3. Edit `standby.liq` — replace:
   ```liquidsoap
   standby = blank()
   ```
   with:
   ```liquidsoap
   standby = mksafe(single("/etc/liquidsoap/standby.mp3"))
   ```
   `mksafe()` falls back to silence if the file is ever unreadable, so the
   output never goes dark.
4. `docker compose restart liquidsoap`

## Rotating through multiple beds

Once you've got more than one bed, use `playlist()` with an `m3u` pointing
at a directory so Liquidsoap loops through them instead of repeating a
single track. See the original on-host script at `infra/icecast/standby.liq`
for a production reference.
