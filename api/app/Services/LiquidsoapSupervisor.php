<?php

namespace App\Services;

use App\Models\Station;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\View;

/**
 * Manages per-station Liquidsoap processes (one Docker container per station).
 *
 * Why per-station processes:
 *  • Crash isolation — one station's bug doesn't take down the others.
 *  • Restart blast radius — adding/removing a station only blips that one.
 *  • Audio graph clarity — each .liq file describes one station's pipeline.
 *
 * Why Docker (not systemd):
 *  • Reproducibility — pinned image, same Liquidsoap version everywhere.
 *  • Stack consistency — matches the rest of GoCast (Docker-first).
 *  • Docker daemon supervises (--restart=always); no extra orchestrator.
 *
 * Operations:
 *  • up()     — render .liq, ensure dirs, (re)start the container.
 *  • down()   — stop + remove container, leave .liq and data dirs in place.
 *  • restart()— stop + start (for picking up .liq changes).
 *  • exists() — is the container currently running?
 *
 * This service shells out to the `docker` CLI, which talks to the
 * docker-socket-proxy sidecar rather than the host daemon socket directly
 * (DOCKER_HOST=tcp://docker-proxy:2375, set in docker-compose.yml). The proxy
 * allowlists only the container/network/image endpoints used here, so a
 * compromised api process can manage stations but can't mount the host root or
 * spawn privileged containers. Notably it does NOT allow exec — see telnet().
 */
class LiquidsoapSupervisor
{
    private const IMAGE = 'gocast/liquidsoap:latest';

    private const NETWORK = 'gocast-network';

    /**
     * Container-name prefix used for every per-station Liquidsoap container.
     * Public so reconcile commands can scan the daemon for orphans without
     * hardcoding the convention in two places.
     */
    public const CONTAINER_PREFIX = 'gocast-liquidsoap-';

    /**
     * Upper bound on every `docker` invocation. The daemon occasionally
     * stalls (socket pressure, image-pull lag) and Laravel's Process facade
     * blocks indefinitely without an explicit timeout — that takes down the
     * HTTP request that triggered the supervisor. 10s is generous for any
     * single docker command on a healthy daemon.
     */
    private const DOCKER_TIMEOUT_SECONDS = 10;

    /**
     * Liquidsoap's telnet control port inside each station container — set by
     * `settings.server.telnet.port` in resources/views/liquidsoap/station.blade.php.
     */
    private const TELNET_PORT = 1234;

    /**
     * Connect + read timeout for telnet commands. Short on purpose: these run
     * inline on HTTP requests (a track reorder fires a playlist reload), and a
     * missed reload is recoverable — Liquidsoap re-reads the m3u on next start.
     */
    private const TELNET_TIMEOUT_SECONDS = 3;

    /** @var string Host path where per-station .liq files live. */
    private string $liqDir;

    /** @var string Host path where per-station playlist tracks live. */
    private string $playlistsDir;

    /** @var string Host path where per-station HLS segments live (Caddy serves). */
    private string $hlsDir;

    public function __construct()
    {
        $this->liqDir = config('liquidsoap.liq_dir', '/var/gocast/liq');
        $this->playlistsDir = config('liquidsoap.playlists_dir', '/var/gocast/playlists');
        $this->hlsDir = config('liquidsoap.hls_dir', '/var/gocast/hls');
    }

    /**
     * Test-environment guard for every method that talks to Docker. The api
     * container has the Docker socket mounted in — without this guard, a
     * single `Station::factory()->create()` call inside a test would spawn
     * a real Liquidsoap container against the host's daemon and leave it
     * running forever (Docker's `--restart=unless-stopped` survives the
     * test ending). Returning early keeps tests fast and the daemon clean.
     */
    public static function inTestMode(): bool
    {
        return app()->runningUnitTests();
    }

    /**
     * Centralized docker invocation: applies the timeout and runs the
     * command. Callers that need stdout call `output()` on the result.
     */
    private function docker(array $cmd): ProcessResult
    {
        return Process::timeout(self::DOCKER_TIMEOUT_SECONDS)->run($cmd)->throw();
    }

    /**
     * Ensure the station's Liquidsoap container is running with the latest
     * .liq config. Idempotent — safe to call repeatedly.
     *
     * Always re-renders the .liq and restarts the container, so this is the
     * right call after a station record changes (name/genre/etc affect the
     * Icecast metadata block in the script). For "is it running, just bring
     * it up if not" without a 3s restart hit, use ensure() instead.
     */
    public function up(Station $station): void
    {
        if (self::inTestMode()) {
            return;
        }

        $this->renderLiqFile($station);
        $this->ensureDirectories($station);

        if ($this->isRunning($station)) {
            $this->restart($station);

            return;
        }

        // Cleanup: a stopped-but-not-removed container with the same name
        // would block `docker run`. Wipe it before starting.
        if ($this->exists($station)) {
            $this->docker(['docker', 'rm', '-f', $this->containerName($station)]);
        }

        $this->run($station);
    }

    /**
     * Defensive "is the container running? if not, start it" — no restart
     * if already healthy. Called by the WHIP auth path before allowing a
     * broadcaster to publish, so a daemon hiccup or OOM kill doesn't leave
     * the broadcaster connecting to MediaMTX with no Liquidsoap consumer.
     *
     * Cheap when the container is already running (one `docker inspect` call,
     * no restart). Expensive only when recovery is needed.
     */
    public function ensure(Station $station): void
    {
        if (self::inTestMode()) {
            return;
        }

        if ($this->isRunning($station)) {
            return;
        }

        $this->up($station);
    }

    /**
     * Stop and remove the station's Liquidsoap container. Leaves the .liq
     * file and host data directories intact — call destroy() for full cleanup.
     */
    public function down(Station $station): void
    {
        if (self::inTestMode()) {
            return;
        }

        $this->removeContainer($this->containerName($station));
    }

    /**
     * Tear down a container by slug — used when a Station has been renamed
     * and the old container name is no longer reachable from the model.
     */
    public function downBySlug(string $slug): void
    {
        if (self::inTestMode()) {
            return;
        }

        $this->removeContainer(self::CONTAINER_PREFIX.$slug);
    }

    /**
     * Stop + remove a container by name. Shared by down() and the reconciler
     * so orphan cleanup can reuse the same teardown without going through
     * a Station model (orphans by definition have no Station row left).
     */
    public function removeContainer(string $name): void
    {
        if (self::inTestMode()) {
            return;
        }

        if (! $this->containerExistsByName($name)) {
            return;
        }

        // `docker rm -f` covers both stop+remove in one call; the separate
        // stop step we used to do was redundant and doubled the timeout
        // budget on a slow daemon.
        $this->docker(['docker', 'rm', '-f', $name]);
    }

    /**
     * Stop + start. Used after re-rendering the .liq file to apply changes
     * (Liquidsoap doesn't hot-reload its top-level audio graph).
     */
    public function restart(Station $station): void
    {
        if (self::inTestMode()) {
            return;
        }

        $this->down($station);
        $this->run($station);
    }

    /**
     * Container exists in any state — running, stopped, exited.
     */
    public function exists(Station $station): bool
    {
        return $this->containerExistsByName($this->containerName($station));
    }

    /**
     * Container exists AND is currently running. Distinguishes "container
     * stopped/crashed and needs to come back" from "container is fine."
     */
    public function isRunning(Station $station): bool
    {
        if (self::inTestMode()) {
            return false;
        }

        $name = $this->containerName($station);
        $result = $this->docker([
            'docker', 'ps', '--filter', "name={$name}",
            '--filter', 'status=running',
            '--format', '{{.Names}}',
        ]);

        return trim($result->output()) === $name;
    }

    /**
     * @return list<string> Every running gocast-liquidsoap-* container name.
     */
    public function listManagedContainers(): array
    {
        if (self::inTestMode()) {
            return [];
        }

        $result = $this->docker([
            'docker', 'ps', '-a',
            '--filter', 'name='.self::CONTAINER_PREFIX,
            '--format', '{{.Names}}',
        ]);

        $lines = preg_split('/\R/', trim($result->output()), -1, PREG_SPLIT_NO_EMPTY);

        return array_values(array_filter($lines ?: [], fn ($name) => str_starts_with($name, self::CONTAINER_PREFIX)));
    }

    private function containerExistsByName(string $name): bool
    {
        if (self::inTestMode()) {
            return false;
        }

        $result = $this->docker([
            'docker', 'ps', '-a', '--filter', "name={$name}",
            '--format', '{{.Names}}',
        ]);

        return trim($result->output()) === $name;
    }

    /**
     * Send a telnet command to the station's running Liquidsoap process.
     * Used for skip-track, playlist reload, metadata updates — all the
     * runtime control we'd otherwise restart for.
     *
     * Speaks Liquidsoap's telnet protocol over a plain TCP socket: the
     * container joins `gocast-network` under a predictable name, so Docker's
     * embedded DNS resolves it from here and the .liq binds the telnet server
     * on 0.0.0.0:1234. The trailing `quit` makes Liquidsoap close the
     * connection so the read loop terminates instead of blocking on EOF.
     *
     * This deliberately does NOT go through `docker exec`. Doing so required
     * granting EXEC on the docker-socket-proxy, and the proxy can't scope exec
     * to our own containers — so it handed anything that compromised the api a
     * shell in every container on the network. A TCP socket needs no Docker
     * API access at all.
     *
     * Newlines are stripped from the command because the protocol is
     * line-delimited: an embedded \n in caller-supplied input (e.g. a track
     * title) would otherwise be read as a second command.
     */
    public function telnet(Station $station, string $command): string
    {
        if (self::inTestMode()) {
            return '';
        }

        $command = str_replace(["\r", "\n"], '', $command);

        $errno = 0;
        $errstr = '';
        $socket = @fsockopen(
            $this->containerName($station),
            self::TELNET_PORT,
            $errno,
            $errstr,
            self::TELNET_TIMEOUT_SECONDS,
        );

        if ($socket === false) {
            throw new \RuntimeException(
                "Liquidsoap telnet connect failed for {$station->slug}: {$errstr} ({$errno})"
            );
        }

        try {
            // Read timeout as well as connect timeout — a wedged Liquidsoap
            // that accepts the connection but never answers would otherwise
            // block the request until PHP's max_execution_time.
            stream_set_timeout($socket, self::TELNET_TIMEOUT_SECONDS);

            fwrite($socket, $command."\nquit\n");

            $response = '';
            while (! feof($socket)) {
                $chunk = fgets($socket);
                if ($chunk === false) {
                    break;
                }
                $response .= $chunk;
            }
        } finally {
            fclose($socket);
        }

        return trim($response);
    }

    private function run(Station $station): void
    {
        $cmd = [
            'docker', 'run', '-d',
            '--name', $this->containerName($station),
            '--network', self::NETWORK,
            '--restart', 'unless-stopped',
            '--add-host', 'host.docker.internal:host-gateway',
        ];

        // Per-station resource caps — keeps one runaway station from
        // starving its neighbors on the same box. Empty string disables
        // the cap (escape hatch for benchmarking; not recommended in prod).
        $cpus = (string) config('liquidsoap.container_cpus', '');
        if ($cpus !== '') {
            $cmd[] = '--cpus';
            $cmd[] = $cpus;
        }
        $memory = (string) config('liquidsoap.container_memory', '');
        if ($memory !== '') {
            $cmd[] = '--memory';
            $cmd[] = $memory;
            // Pin swap to the same value: without this Docker silently
            // gives the container 2x memory in swap, which means the cap
            // isn't really a cap on a host with swap enabled.
            $cmd[] = '--memory-swap';
            $cmd[] = $memory;
        }

        $cmd = array_merge($cmd, [
            '-v', "{$this->liqDir}/{$station->slug}.liq:/station.liq:ro",
            '-v', "{$this->playlistsDir}/{$station->slug}:/data/playlists:ro",
            '-v', "{$this->hlsDir}/{$station->slug}:/data/hls",
            self::IMAGE,
            '/station.liq',
        ]);

        $this->docker($cmd);

        Log::info('Liquidsoap container started', [
            'station' => $station->slug,
            'container' => $this->containerName($station),
            'cpus' => $cpus,
            'memory' => $memory,
        ]);
    }

    private function renderLiqFile(Station $station): void
    {
        $contents = View::make('liquidsoap.station', [
            'station' => $station,
            'icecastPassword' => config('services.icecast.source_password'),
            // Embedded so the on_metadata callback can authenticate to
            // /api/internal/now-playing. Sent as the X-Internal-Key header.
            'internalApiKey' => (string) config('services.internal_api_key'),
        ])->render();

        File::ensureDirectoryExists($this->liqDir);
        File::put("{$this->liqDir}/{$station->slug}.liq", $contents);
    }

    private function ensureDirectories(Station $station): void
    {
        $playlists = "{$this->playlistsDir}/{$station->slug}";
        $hls = "{$this->hlsDir}/{$station->slug}";

        File::ensureDirectoryExists($playlists);
        File::ensureDirectoryExists($hls);

        // /var/gocast is set up by infra/setup-host.sh as 100:101 0775,
        // but mkdir() inside the api container (running as root) doesn't
        // inherit that group — new subdirs land as root:root 0755 unless
        // we widen them. Liquidsoap (UID 100 inside its container) must
        // be able to write HLS segments into its dir; permissive 0777 is
        // safe because /var/gocast is firewalled at the host level and
        // only the api/Liquidsoap containers can reach it.
        @chmod($playlists, 0777);
        @chmod($hls, 0777);
    }

    public function containerName(Station $station): string
    {
        return self::CONTAINER_PREFIX.$station->slug;
    }

    /**
     * Inverse of containerName(): pull the station slug out of a container
     * name. Returns null if the name doesn't match our prefix convention.
     */
    public static function slugFromContainerName(string $name): ?string
    {
        if (! str_starts_with($name, self::CONTAINER_PREFIX)) {
            return null;
        }

        $slug = substr($name, strlen(self::CONTAINER_PREFIX));

        return $slug === '' ? null : $slug;
    }
}
