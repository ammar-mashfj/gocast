<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Per-station Liquidsoap host paths
    |--------------------------------------------------------------------------
    |
    | Liquidsoap runs as Docker containers spawned by LiquidsoapSupervisor —
    | one per station. These directories on the HOST are bind-mounted into
    | each container; they must exist before a station starts up. Created
    | by infra/setup-host.sh.
    |
    | Inside the container the mounts always resolve as:
    |   /station.liq         (file, read-only)
    |   /data/playlists/     (dir, read-only)
    |   /data/hls/           (dir, read-write)
    |
    | The path values here are HOST paths used as the source of those
    | bind mounts. The api container needs `/var/gocast` mounted in for
    | Laravel to write the .liq files; see docker-compose.yml.
    */

    'liq_dir' => env('LIQUIDSOAP_LIQ_DIR', '/var/gocast/liq'),
    'playlists_dir' => env('LIQUIDSOAP_PLAYLISTS_DIR', '/var/gocast/playlists'),
    'hls_dir' => env('LIQUIDSOAP_HLS_DIR', '/var/gocast/hls'),

    /*
    | Per-station AutoDJ storage cap. Total bytes of all tracks combined.
    | Uploads that would push the station over this cap are rejected.
    */
    'station_storage_bytes' => (int) env('LIQUIDSOAP_STATION_STORAGE_BYTES', 100 * 1024 * 1024),

    /*
    |--------------------------------------------------------------------------
    | Per-station container resource caps
    |--------------------------------------------------------------------------
    |
    | Passed to `docker run` as `--cpus` and `--memory` for every per-station
    | Liquidsoap container. Liquidsoap idling on a single ~128kbps Icecast
    | output uses well under 0.25 CPU and ~50MB RSS in practice; the caps
    | below are sized to absorb a transcoding spike (FFmpeg re-encode of an
    | incoming RTSP stream, HLS segment muxing) without permitting a runaway
    | station to starve its neighbors on the same host.
    |
    | Tune via env: numbers can be fractional ("0.5") for cpus, and accept
    | a "b/k/m/g" suffix for memory. Set either to an empty string to
    | disable the corresponding cap (not recommended in prod).
    */
    'container_cpus' => env('LIQUIDSOAP_CONTAINER_CPUS', '0.5'),
    'container_memory' => env('LIQUIDSOAP_CONTAINER_MEMORY', '256m'),
];
