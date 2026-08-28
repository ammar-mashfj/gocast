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
    private const NETWORK = 'gocast-network';

    /**
     * Container-name prefix used for every per-station Liquidsoap container.
     * Public so reconcile commands can scan the daemon for orphans without
     * hardcoding the convention in two places.
     */
    public const CONTAINER_PREFIX = 'gocast-liquidsoap-';

    /** Docker health states we care about. */
    public const HEALTH_HEALTHY = 'healthy';

    public const HEALTH_UNHEALTHY = 'unhealthy';

    public const HEALTH_STARTING = 'starting';

    /** Container has no healthcheck configured. */
    public const HEALTH_NONE = 'none';

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

    /**
     * Names of the `interactive.bool` / `interactive.float` variables the
     * station script declares for jingle scheduling, addressed over telnet as
     * `var.set <name> = <value>`.
     *
     * They exist so these two settings can change WITHOUT a container restart:
     * baked in as literals, every tweak to how often a station ID plays would
     * drop every listener mid-track. The rendered script carries the current
     * values as its initial state, so telnet is a fast path and the row in the
     * database remains the source of truth.
     *
     * Constants rather than strings at the call site because the same names
     * appear in the Blade template — a typo on either side fails silently,
     * with the setting simply never taking effect until the next restart.
     */
    public const VAR_JINGLES_ENABLED = 'jingles_enabled';

    public const VAR_JINGLE_BY_TRACKS = 'jingle_by_tracks';

    public const VAR_JINGLE_INTERVAL = 'jingle_interval';

    public const VAR_JINGLE_EVERY_TRACKS = 'jingle_every_tracks';

    /**
     * Free-tier watermark, same interactive-variable mechanism as the jingle
     * settings — and for a sharper reason. This one flips when somebody
     * UPGRADES, and making a paying customer's listeners sit through a
     * reconnect to stop hearing "powered by GoCast" would be a poor way to
     * begin the relationship.
     */
    public const VAR_WATERMARK_ENABLED = 'watermark_enabled';

    public const VAR_WATERMARK_INTERVAL = 'watermark_interval';

    public const VAR_WATERMARK_DUCK = 'watermark_duck';

    /**
     * Where the shared clip directory is mounted inside every container.
     * Read-only, and identical for all stations — it is platform content, not
     * station content.
     */
    private const CONTAINER_SYSTEM_DIR = '/data/system';

    /** @var string Host path where per-station .liq files live. */
    private string $liqDir;

    /** @var string Host path where per-station playlist tracks live. */
    private string $playlistsDir;

    /** @var string Host path where per-station HLS segments live (Caddy serves). */
    private string $hlsDir;

    /** Shared platform audio (the watermark clip). One directory for the box. */
    private string $systemDir;

    public function __construct()
    {
        $this->liqDir = config('liquidsoap.liq_dir', '/var/gocast/liq');
        $this->playlistsDir = config('liquidsoap.playlists_dir', '/var/gocast/playlists');
        $this->hlsDir = config('liquidsoap.hls_dir', '/var/gocast/hls');
        $this->systemDir = config('liquidsoap.system_dir', '/var/gocast/system');
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
     * Same, but a non-zero exit is an answer rather than an exception.
     *
     * `docker inspect` on a container that does not exist exits 1, which is
     * information — not a failure worth unwinding a request for.
     */
    private function dockerQuiet(array $cmd): ProcessResult
    {
        return Process::timeout(self::DOCKER_TIMEOUT_SECONDS)->run($cmd);
    }

    private function image(): string
    {
        return (string) config('liquidsoap.image', 'gocast/liquidsoap:latest');
    }

    /**
     * Seconds Docker waits after SIGTERM before SIGKILLing a station.
     *
     * Clamped below DOCKER_TIMEOUT_SECONDS, because a stop timeout longer than
     * Laravel's own Process timeout means the CLI is killed part-way through
     * the shutdown — reintroducing, via a config typo, exactly the SIGKILL the
     * graceful stop exists to avoid. Applied to both the container's own
     * stop-timeout and the `docker stop` we issue, so the two cannot disagree.
     */
    private function stopTimeout(): int
    {
        return max(1, min(
            (int) config('liquidsoap.stop_timeout_seconds', 5),
            self::DOCKER_TIMEOUT_SECONDS - 3,
        ));
    }

    /**
     * Ensure the station's Liquidsoap container is running with the latest
     * .liq config. Idempotent — safe to call repeatedly.
     *
     * Always re-renders the .liq and restarts the container, so this is the
     * right call after a station record changes (name/genre/etc affect the
     * Icecast metadata block in the script). It is deliberately blunt: a
     * restart drops connected listeners, so callers that only want a station
     * to be on air — the power button, the WHIP auth hook — go through
     * StationLifecycleService, which skips the restart when the container is
     * already healthy.
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

        // Stop, THEN remove. `docker rm -f` is a SIGKILL: measured on the
        // shipped image, a graceful stop costs 509ms and exits 0, having
        // written the HLS `persist_at` state and closed the Icecast source
        // socket. Killing skips both — every restart then resets the HLS media
        // sequence (stalling clients mid-stream) and the mount lingers on
        // Icecast until it times the source out.
        //
        // The stop timeout must stay under DOCKER_TIMEOUT_SECONDS or Laravel's
        // Process timeout kills the CLI mid-shutdown, which is the SIGKILL we
        // were trying to avoid. Guarded here rather than trusted to config.
        $timeout = $this->stopTimeout();

        try {
            $this->docker(['docker', 'stop', '--timeout', (string) $timeout, $name]);
        } catch (\Throwable $e) {
            // A container that is already gone, or a daemon that refuses the
            // stop, must not leave the container behind — fall through to the
            // forced removal below, which is still better than nothing.
            Log::warning('Graceful stop failed, forcing removal', [
                'container' => $name,
                'error' => $e->getMessage(),
            ]);
        }

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
     *
     * Deliberately NOT `docker ps --filter status=running`, which was the
     * previous implementation and lies during a crash loop: Docker's restart
     * backoff starts around 100ms, so a container that has never successfully
     * booted is genuinely in the `running` state most of the time. Measured on
     * a station with a broken .liq, that filter matched 5 samples out of 5 over
     * the first 10 seconds. `.State.Status` reports `restarting` for exactly
     * that case, which is the answer callers actually want — a station being
     * restarted in a loop is not one anybody should be publishing into.
     */
    public function isRunning(Station $station): bool
    {
        if (self::inTestMode()) {
            return false;
        }

        return $this->containerState($this->containerName($station))['status'] === 'running';
    }

    /**
     * Running AND passing its healthcheck.
     *
     * Containers started before healthchecks existed (or with the check
     * disabled by config) report health `none`; for those, running is the best
     * answer available and is treated as healthy so a rollout doesn't declare
     * every existing station sick.
     */
    public function isHealthy(Station $station): bool
    {
        if (self::inTestMode()) {
            return true;
        }

        $state = $this->containerState($this->containerName($station));

        if ($state['status'] !== 'running') {
            return false;
        }

        return in_array($state['health'], [self::HEALTH_HEALTHY, self::HEALTH_NONE], true);
    }

    /**
     * Everything Docker knows about a container, in one call.
     *
     * This is the difference between "we ran a docker command and it exited 0"
     * and "the station is actually up". `docker run -d` exits 0 for a container
     * that dies immediately afterwards; the exit code, the OOM flag and the
     * restart count are where that shows up.
     *
     * @return array{exists: bool, status: string, health: string, exit_code: int, oom_killed: bool, restart_count: int}
     */
    public function containerState(string $name): array
    {
        if (self::inTestMode()) {
            return $this->stateTuple(true, 'running', self::HEALTH_NONE, 0, false, 0);
        }

        // Health lives under .State.Health only when the container was started
        // with a healthcheck; the `if` keeps the template from erroring on
        // containers that were not.
        $format = '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
            .'|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.RestartCount}}';

        $result = $this->dockerQuiet(['docker', 'inspect', '-f', $format, $name]);

        if (! $result->successful()) {
            return $this->stateTuple(false, 'absent', self::HEALTH_NONE, 0, false, 0);
        }

        $parts = explode('|', trim($result->output()));

        return $this->stateTuple(
            true,
            $parts[0] ?? 'unknown',
            $parts[1] ?? self::HEALTH_NONE,
            (int) ($parts[2] ?? 0),
            ($parts[3] ?? 'false') === 'true',
            (int) ($parts[4] ?? 0),
        );
    }

    /**
     * @return array{exists: bool, status: string, health: string, exit_code: int, oom_killed: bool, restart_count: int}
     */
    private function stateTuple(
        bool $exists,
        string $status,
        string $health,
        int $exitCode,
        bool $oomKilled,
        int $restartCount,
    ): array {
        return [
            'exists' => $exists,
            'status' => $status,
            'health' => $health,
            'exit_code' => $exitCode,
            'oom_killed' => $oomKilled,
            'restart_count' => $restartCount,
        ];
    }

    /**
     * Last lines of a container's log. Used to attach a reason to a start
     * failure — the answer is almost always sitting there ("Error 4: Undefined
     * variable ..."), we simply never read it.
     *
     * The exception is an OOM kill at boot, which produces an empty log; that
     * is what `oom_killed` in containerState() is for.
     */
    public function logTail(string $name, int $lines = 20): string
    {
        if (self::inTestMode()) {
            return '';
        }

        $result = $this->dockerQuiet(['docker', 'logs', '--tail', (string) $lines, $name]);

        // Liquidsoap logs to stdout, but a crash on startup can land on stderr.
        return trim($result->output()."\n".$result->errorOutput());
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

    /**
     * Every managed container with the state Docker reports for it, in a
     * single `docker ps` — so the reconciler can classify orphan / unwanted /
     * missing / unhealthy without one inspect per station.
     *
     * `{{.Status}}` carries health in parentheses ("Up 2 hours (unhealthy)"),
     * which is the only place `docker ps` exposes it.
     *
     * @return array<string, array{status: string, health: string}>
     */
    public function listContainerStates(): array
    {
        if (self::inTestMode()) {
            return [];
        }

        $result = $this->docker([
            'docker', 'ps', '-a',
            '--filter', 'name='.self::CONTAINER_PREFIX,
            '--format', '{{.Names}}|{{.State}}|{{.Status}}',
        ]);

        $states = [];

        foreach (preg_split('/\R/', trim($result->output()), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $line) {
            [$name, $state, $status] = array_pad(explode('|', $line, 3), 3, '');

            if (! str_starts_with($name, self::CONTAINER_PREFIX)) {
                continue;
            }

            $health = self::HEALTH_NONE;
            if (preg_match('/\((healthy|unhealthy|health: starting)\)/', $status, $m) === 1) {
                $health = $m[1] === 'health: starting' ? self::HEALTH_STARTING : $m[1];
            }

            $states[$name] = ['status' => $state, 'health' => $health];
        }

        return $states;
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

        $host = $this->containerHost($station);

        $errno = 0;
        $errstr = '';
        $socket = @fsockopen(
            $host,
            self::TELNET_PORT,
            $errno,
            $errstr,
            self::TELNET_TIMEOUT_SECONDS,
        );

        if ($socket === false) {
            throw new \RuntimeException(
                "Liquidsoap telnet connect failed for {$station->slug} at {$host}: {$errstr} ({$errno})"
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

    /**
     * Push the station's current jingle settings into its running container,
     * live. Returns true if both landed.
     *
     * This is the reason jingle settings are interactive variables rather than
     * literals in the rendered script: a restart re-reads the .liq but also
     * disconnects every listener mid-track, which is an absurd price for
     * changing how often a station ID plays.
     *
     * Best-effort by design, exactly like PlaylistFileWriter::reload(). A
     * stopped or restarting station simply has nothing to tell — it will read
     * the same values out of the freshly rendered script when it next boots,
     * because renderLiqFile() emits them as the initial state. Losing this
     * call can therefore delay a setting, never lose it.
     */
    public function applyJingleSettings(Station $station): bool
    {
        // Floats must carry a decimal point: Liquidsoap's `var.set` is typed,
        // and "1800" for a float variable is refused outright. The int
        // variable is the mirror image — "5.0" is refused there.
        $interval = number_format(
            max(60.0, (float) $station->jingle_interval_seconds),
            1,
            '.',
            '',
        );

        // Both mode settings are always sent, not just the active one. They
        // are independent variables in the script, and pushing only the mode
        // in use would leave the other stale — so switching modes back would
        // briefly apply whatever value was last written, until the next save.
        $commands = [
            self::VAR_JINGLES_ENABLED.' = '.($station->jingles_enabled ? 'true' : 'false'),
            self::VAR_JINGLE_BY_TRACKS.' = '.($station->jingle_mode === Station::JINGLE_MODE_TRACKS ? 'true' : 'false'),
            self::VAR_JINGLE_INTERVAL.' = '.$interval,
            self::VAR_JINGLE_EVERY_TRACKS.' = '.max(1, (int) $station->jingle_every_tracks),
        ];

        foreach ($commands as $assignment) {
            try {
                $this->telnet($station, 'var.set '.$assignment);
            } catch (\Throwable $e) {
                Log::info('Jingle settings not applied live', [
                    'station' => $station->slug,
                    'command' => $assignment,
                    'error' => $e->getMessage(),
                ]);

                return false;
            }
        }

        return true;
    }

    /**
     * Does this station's OWNER's plan carry the free-tier watermark?
     *
     * Note the direction of the question. It is never "has this station opted
     * in" — there is no station column, precisely so that no request, and no
     * future form field added by accident, can switch it off. Upgrading is the
     * only way it turns off, which is the entire point of it.
     *
     * A station whose owner or plan cannot be resolved is treated as NOT
     * watermarked. Failing the other way would put "powered by GoCast" over a
     * paying customer's show because of a missing eager-load.
     */
    public function watermarkEnabledFor(Station $station): bool
    {
        return $station->user?->watermarked() ?? false;
    }

    /**
     * Push the watermark settings into a running container, live.
     *
     * Called when the OWNER'S PLAN changes rather than when the station does —
     * an upgrade should silence the watermark within seconds, without the
     * reconnect a restart would inflict on the listeners the customer just paid
     * to keep. Best-effort for the same reason as the jingle settings: these
     * values are also rendered into the script as its initial state, so a
     * container that is down or unreachable is correct again on its next boot.
     */
    public function applyWatermarkSettings(Station $station): bool
    {
        $commands = [
            self::VAR_WATERMARK_ENABLED.' = '.($this->watermarkEnabledFor($station) ? 'true' : 'false'),
            self::VAR_WATERMARK_INTERVAL.' = '.number_format($this->watermarkInterval(), 1, '.', ''),
            self::VAR_WATERMARK_DUCK.' = '.number_format($this->watermarkDuck(), 3, '.', ''),
        ];

        foreach ($commands as $assignment) {
            try {
                $this->telnet($station, 'var.set '.$assignment);
            } catch (\Throwable $e) {
                Log::info('Watermark settings not applied live', [
                    'station' => $station->slug,
                    'command' => $assignment,
                    'error' => $e->getMessage(),
                ]);

                return false;
            }
        }

        return true;
    }

    /**
     * Floored at 60s. Below a minute this stops reading as branding and starts
     * reading as a fault — and since free stations are live-only, it would be
     * ducking a person mid-sentence roughly once per paragraph.
     */
    private function watermarkInterval(): float
    {
        return max(60.0, (float) config('liquidsoap.watermark_interval_seconds'));
    }

    /**
     * The portion of the station's own audio KEPT while the watermark plays.
     * Clamped into (0, 1]: above 1 it would amplify rather than duck, and at
     * exactly 0 the station is muted outright rather than ducked, which sounds
     * like the stream dropped.
     */
    private function watermarkDuck(): float
    {
        return min(1.0, max(0.01, (float) config('liquidsoap.watermark_duck')));
    }

    /**
     * Resolve the address of a station container, for telnet (control) and
     * harbor HTTP (status) alike.
     *
     * Which form is correct depends on where Laravel itself is running, which
     * is why it's config rather than detection — see `telnet_resolve` in
     * config/liquidsoap.php:
     *
     *  • 'name' (default, production): the container name, resolved by
     *    Docker's embedded DNS. Only works when Laravel is a compose service
     *    on gocast-network. Costs nothing.
     *
     *  • 'ip' (Laravel running natively on the host): ask the daemon for the
     *    container's bridge IP. Docker's DNS is only available to containers,
     *    so a host process cannot resolve the name at all — but it can route
     *    to the IP directly on Linux.
     *
     * The inspect result is deliberately not cached: container IPs change on
     * every restart, and a stale one fails in a way that looks like a wedged
     * Liquidsoap rather than a bad address.
     */
    public function containerHost(Station $station): string
    {
        $name = $this->containerName($station);

        // Same reason as every other guard in this class: the 'ip' branch
        // shells out to `docker inspect`, and a test that only wanted an
        // address would otherwise talk to the host daemon. Tests fake the
        // HTTP/telnet layer above this, so the name is all they need.
        if (self::inTestMode()) {
            return $name;
        }

        if (config('liquidsoap.telnet_resolve') !== 'ip') {
            return $name;
        }

        // `index` rather than the dotted form: {{.Networks.gocast-network}}
        // silently evaluates to empty because Go templates read the hyphen as
        // subtraction, so the failure looks like "container has no IP" instead
        // of a bad selector. Ranging over all networks would also work today
        // but concatenates addresses if a container is ever attached to two.
        $result = $this->docker([
            'docker', 'inspect', '-f',
            '{{(index .NetworkSettings.Networks "'.self::NETWORK.'").IPAddress}}',
            $name,
        ]);

        $ip = trim($result->output());

        if ($ip === '') {
            throw new \RuntimeException(
                "Could not resolve an IP for {$name} — is the container running?"
            );
        }

        return $ip;
    }

    /**
     * WebSocket URL a browser uses to publish into this station's harbor.
     *
     * Production sets `liquidsoap.ingest_url` to a path on the main domain
     * (e.g. `wss://gocast.fm/broadcast/{slug}`) which the reverse proxy routes
     * to the right container — one TLS endpoint, no per-station DNS, and the
     * ingest port is never exposed.
     *
     * With it unset — local hybrid dev — we address the container directly on
     * the Docker bridge. That works because Linux routes to bridge IPs from
     * the host, so the browser can reach it without publishing a port and
     * without a proxy in front. It is not a production path: the IP changes on
     * every restart and it is plain `ws://`.
     */
    public function ingestUrl(Station $station): string
    {
        $template = (string) config('liquidsoap.ingest_url');

        if ($template !== '') {
            return str_replace('{slug}', $station->slug, $template);
        }

        $host = $this->containerHost($station);
        $port = (int) config('liquidsoap.harbor_input_port', 8090);

        return "ws://{$host}:{$port}/{$station->slug}";
    }

    private function run(Station $station): void
    {
        $cmd = array_merge(
            $this->baseRunCommand($station),
            $this->sandboxFlags(),
            $this->healthFlags(),
            $this->resourceFlags(),
            $this->mountFlags($station),
        );

        $this->docker($cmd);

        Log::info('Liquidsoap container started', [
            'station' => $station->slug,
            'container' => $this->containerName($station),
        ]);

        $this->verifyStarted($station);
    }

    /**
     * Confirm the container is still alive a beat after `docker run`.
     *
     * `docker run -d` exits 0 once the container is CREATED — a station whose
     * script fails to parse, or which is OOM-killed while building its audio
     * graph, reports a successful start and then dies. Without this the API
     * returns 202, nothing notices, and the station sits in `starting` until a
     * human goes looking. The reason is almost always already in the container
     * log; the OOM case has an empty log and shows up as `oom_killed`.
     *
     * Intent has already been recorded by StationLifecycleService at this
     * point, so throwing here does not lose the station: the reconciler retries
     * it within five minutes. Failing loudly buys an accurate error now.
     *
     * @throws StationLifecycleException
     */
    private function verifyStarted(Station $station): void
    {
        $delayMs = (int) config('liquidsoap.start_verify_delay_ms', 750);

        if ($delayMs <= 0) {
            return;
        }

        usleep($delayMs * 1000);

        $name = $this->containerName($station);
        $state = $this->containerState($name);

        if ($state['status'] === 'running') {
            return;
        }

        $context = [
            'station' => $station->slug,
            'container' => $name,
            'status' => $state['status'],
            'exit_code' => $state['exit_code'],
            'oom_killed' => $state['oom_killed'],
            'restart_count' => $state['restart_count'],
            'logs' => $this->logTail($name),
        ];

        // An OOM kill at boot is its own diagnosis with a known cause: the
        // memory cap set below what Liquidsoap needs to build the ffmpeg input
        // and the HLS encoder. Say so rather than making someone rediscover it
        // from an empty log.
        if ($state['oom_killed']) {
            Log::error('Station container was OOM-killed at boot', $context);

            throw StationLifecycleException::startFailed(
                'The station ran out of memory while starting.'
            );
        }

        Log::error('Station container died immediately after start', $context);

        throw StationLifecycleException::startFailed();
    }

    /**
     * @return list<string>
     */
    private function baseRunCommand(Station $station): array
    {
        return [
            'docker', 'run', '-d',
            '--name', $this->containerName($station),
            '--network', self::NETWORK,
            '--restart', 'unless-stopped',
            '--add-host', 'host.docker.internal:host-gateway',
            // Stop signal and grace period belong on the container, not only on
            // the code path that stops it: a `docker stop` issued by hand, or by
            // a host shutdown, should drain just as cleanly as ours does.
            '--stop-signal', 'SIGTERM',
            '--stop-timeout', (string) $this->stopTimeout(),
            // Identity that survives a rename. The reconciler recovers a slug by
            // parsing the container name, which is precisely what a rename
            // changes; labels also make log shipping and ad-hoc `docker ps
            // --filter label=` work.
            '--label', 'gocast.station='.$station->slug,
            '--label', 'gocast.station_id='.$station->id,
            // Log rotation. These containers are spawned outside compose, so
            // the `x-logging` policy in docker-compose.yml does not reach
            // them — without these flags each station's log grows without
            // bound until it fills the disk. A station that is retrying an
            // RTSP connect logs continuously, so this is not theoretical.
            '--log-opt', 'max-size=10m',
            '--log-opt', 'max-file=3',
        ];
    }

    /**
     * Liquidsoap needs no capabilities beyond reading its mounts and opening
     * sockets. Dropping the lot costs nothing and shrinks what a compromised
     * station process can reach; `no-new-privileges` blocks setuid escalation
     * and the pid cap bounds a fork storm.
     *
     * `--init` is opt-in: the image handles SIGTERM correctly as PID 1 (a
     * graceful stop was measured at 509ms and exit 0), so a reaper is only
     * needed once per-track protocol resolvers start forking ffmpeg.
     *
     * @return list<string>
     */
    private function sandboxFlags(): array
    {
        $flags = [
            '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges',
        ];

        $pids = (int) config('liquidsoap.container_pids_limit', 0);
        if ($pids > 0) {
            $flags[] = '--pids-limit';
            $flags[] = (string) $pids;
        }

        if ((bool) config('liquidsoap.container_init', false)) {
            $flags[] = '--init';
        }

        return $flags;
    }

    /**
     * Let Docker poll the station's own /healthz, so `docker ps` carries an
     * honest answer and the reconciler gets `--filter health=unhealthy` for
     * free.
     *
     * The probe is bash's /dev/tcp because the image ships no curl, wget or
     * nc. /healthz answers 200 only when the audio graph is producing frames
     * AND the Icecast connection is up, so "healthy" means audible rather than
     * merely alive.
     *
     * start_period must cover a cold boot — audio graph plus Icecast connect —
     * or a station is marked unhealthy while it is still legitimately coming up.
     *
     * @return list<string>
     */
    private function healthFlags(): array
    {
        if (! (bool) config('liquidsoap.health_enabled', true)) {
            return [];
        }

        $port = (int) config('liquidsoap.harbor_port', 8080);

        $probe = sprintf(
            'exec 3<>/dev/tcp/127.0.0.1/%d && printf "GET /healthz HTTP/1.0\r\n\r\n" >&3 && head -1 <&3 | grep -q " 200 "',
            $port,
        );

        return [
            '--health-cmd', 'bash -c '.escapeshellarg($probe),
            '--health-interval', config('liquidsoap.health_interval_seconds', 15).'s',
            '--health-timeout', config('liquidsoap.health_timeout_seconds', 3).'s',
            '--health-retries', (string) config('liquidsoap.health_retries', 3),
            '--health-start-period', config('liquidsoap.health_start_period_seconds', 45).'s',
        ];
    }

    /**
     * Per-station resource caps — keeps one runaway station from starving its
     * neighbors on the same box. Empty string disables the cap (escape hatch
     * for benchmarking; not recommended in prod).
     *
     * @return list<string>
     */
    private function resourceFlags(): array
    {
        $flags = [];

        $cpus = (string) config('liquidsoap.container_cpus', '');
        if ($cpus !== '') {
            $flags[] = '--cpus';
            $flags[] = $cpus;
        }

        $memory = (string) config('liquidsoap.container_memory', '');
        if ($memory !== '') {
            $flags[] = '--memory';
            $flags[] = $memory;
            // Pin swap to the same value: without this Docker silently gives
            // the container 2x memory in swap, which means the cap isn't
            // really a cap on a host with swap enabled.
            $flags[] = '--memory-swap';
            $flags[] = $memory;
        }

        return $flags;
    }

    /**
     * @return list<string>
     */
    private function mountFlags(Station $station): array
    {
        return [
            '-v', "{$this->liqDir}/{$station->slug}.liq:/station.liq:ro",
            '-v', "{$this->playlistsDir}/{$station->slug}:/data/playlists:ro",
            '-v', "{$this->hlsDir}/{$station->slug}:/data/hls",
            // Shared and read-only: the same clip directory for every station
            // on the box. Mounted unconditionally, even when watermarking is
            // switched off, so turning it back on is a re-render rather than a
            // container recreate.
            '-v', "{$this->systemDir}:".self::CONTAINER_SYSTEM_DIR.':ro',
            $this->image(),
            '/station.liq',
        ];
    }

    /**
     * Remove the rendered .liq and the HLS working directory for a station
     * that is gone for good. The playlist tree is PlaylistFileWriter's to
     * delete (StationObserver::forceDeleted); these two are ours, and without
     * this they accumulate for every station ever hard-deleted.
     */
    public function destroyArtifacts(string $slug): void
    {
        foreach (["{$this->liqDir}/{$slug}.liq", "{$this->hlsDir}/{$slug}"] as $path) {
            if (is_dir($path)) {
                File::deleteDirectory($path);
            } elseif (is_file($path)) {
                File::delete($path);
            }
        }
    }

    private function renderLiqFile(Station $station): void
    {
        $contents = View::make('liquidsoap.station', [
            'station' => $station,
            'icecastPassword' => config('services.icecast.source_password'),
            // Embedded so the on_metadata callback can authenticate to
            // /api/internal/now-playing. Sent as the X-Internal-Key header.
            'internalApiKey' => (string) config('services.internal_api_key'),
            // Addresses from the STATION CONTAINER's point of view, not
            // Laravel's — see config/liquidsoap.php. Defaults are the
            // compose service names; overridden by env when Laravel and
            // Icecast run natively on the host instead of in containers.
            'icecastHost' => (string) config('liquidsoap.icecast_host'),
            'icecastPort' => (int) config('liquidsoap.icecast_port'),
            'apiUrl' => rtrim((string) config('liquidsoap.api_url'), '/'),
            // Harbor control surface — /status and /healthz, read by
            // StationStatusService over gocast-network.
            'harborPort' => (int) config('liquidsoap.harbor_port'),
            // Harbor ingest — where broadcasters connect (webcast WebSocket
            // or the Icecast source protocol).
            'harborInputPort' => (int) config('liquidsoap.harbor_input_port'),
            'harborInputTimeout' => (float) config('liquidsoap.harbor_input_timeout'),
            // Dead-air guard on the live input; 0 disables it.
            'blankMax' => (float) config('liquidsoap.blank_max_seconds'),
            'blankThreshold' => (float) config('liquidsoap.blank_threshold_db'),
            // Jingles. Per-station rather than per-install: which IDs a
            // station plays and how often is editorial, not operational.
            // The source name and filename are passed through from
            // PlaylistFileWriter's constants so the telnet reload command and
            // the path in the script can never drift from what Laravel writes.
            'jinglesEnabled' => (bool) $station->jingles_enabled,
            // AutoDJ rotation. `autodjDynamic` picks which source the script
            // is built around: Laravel answering one track at a time, or the
            // legacy playlist file. See config/liquidsoap.php for why the
            // switch exists — this is the audio path, and a rollback should
            // not need a deploy.
            'autodjDynamic' => (bool) config('liquidsoap.autodj_dynamic'),
            'autodjRetryDelay' => max(1.0, (float) config('liquidsoap.autodj_retry_delay_seconds')),
            // Built here rather than in the view so the slug is encoded once,
            // by something that knows it is going into a URL.
            'nextTrackUrl' => rtrim((string) config('liquidsoap.api_url'), '/')
                .'/api/internal/next-track?slug='.rawurlencode($station->slug),
            // The telnet namespace both modes answer on. StationPowerController
            // sends "{source}.skip" without knowing which mode is live, so the
            // two sources must share an id.
            'liqSource' => PlaylistFileWriter::LIQ_SOURCE,
            'jinglesLiqSource' => PlaylistFileWriter::JINGLES_LIQ_SOURCE,
            'jinglesFilename' => PlaylistFileWriter::JINGLES_FILENAME,
            'jinglesEnabledVar' => self::VAR_JINGLES_ENABLED,
            'jingleByTracksVar' => self::VAR_JINGLE_BY_TRACKS,
            'jingleIntervalVar' => self::VAR_JINGLE_INTERVAL,
            'jingleEveryTracksVar' => self::VAR_JINGLE_EVERY_TRACKS,
            // The script takes a boolean rather than the mode string: it only
            // ever asks "am I counting tracks?", and a string comparison in
            // the audio graph would be a second place for the two spellings
            // to drift apart.
            'jingleByTracks' => $station->jingle_mode === Station::JINGLE_MODE_TRACKS,
            'jingleEveryTracks' => max(1, (int) $station->jingle_every_tracks),
            // Free-tier watermark. `supported` is the install-wide switch that
            // decides whether the machinery exists at all; `enabled` is the
            // per-station initial state, read from the OWNER'S PLAN and never
            // from the station — there is deliberately no station column for
            // it, so no request can turn it off.
            'watermarkSupported' => (bool) config('liquidsoap.watermark_enabled'),
            'watermarkEnabled' => $this->watermarkEnabledFor($station),
            'watermarkEnabledVar' => self::VAR_WATERMARK_ENABLED,
            'watermarkIntervalVar' => self::VAR_WATERMARK_INTERVAL,
            'watermarkDuckVar' => self::VAR_WATERMARK_DUCK,
            'watermarkContainerDir' => self::CONTAINER_SYSTEM_DIR,
            'watermarkInterval' => $this->watermarkInterval(),
            'watermarkDuck' => $this->watermarkDuck(),
            'watermarkFade' => (float) config('liquidsoap.watermark_fade_seconds'),
            // Floored well above zero: delay(0.) makes the jingle source
            // permanently ready, so every single track boundary would fire a
            // jingle. The request layer already enforces a 60s minimum — this
            // is the backstop for a row edited by hand or by a seeder.
            'jingleInterval' => max(60.0, (float) $station->jingle_interval_seconds),
            // AutoDJ track transitions. Off => hard cuts, which is the safe
            // fallback if a transition ever wedges playback again.
            'crossfadeEnabled' => (bool) config('liquidsoap.crossfade_enabled'),
            'crossfadeDuration' => $crossfadeDuration = (float) config('liquidsoap.crossfade_duration'),
            // The fade envelopes must fit strictly inside the cross window, or
            // they never complete and the transition jumps in volume (see the
            // Liquidsoap book §6.4). Clamped rather than trusted, so a bad env
            // pairing degrades to a short fade instead of a broken one.
            'crossfadeFade' => min(
                (float) config('liquidsoap.crossfade_fade'),
                max($crossfadeDuration - 0.5, 0.1),
            ),
            // Peak limiter. `includeLive` picks where in the graph it sits:
            // at the bottom past the live/AutoDJ fallback (guarding everything
            // a listener hears), or wrapping the AutoDJ arm alone, which is the
            // previous behaviour kept as the rollback.
            'limiterThreshold' => (float) config('liquidsoap.limiter_threshold_db'),
            'limiterIncludeLive' => (bool) config('liquidsoap.limiter_include_live'),
            // Metadata a broadcaster sends in band. The placeholder covers the
            // client that sends none — without it the last AutoDJ title stays
            // in every listener's player for the whole show.
            'liveBroadcastText' => (string) config('liquidsoap.live_broadcast_text'),
            'metadataCharset' => (string) config('liquidsoap.metadata_charset'),
            // OCaml GC. 0 omits the block and runs the stock collector.
            'gcSpaceOverhead' => max(0, (int) config('liquidsoap.gc_space_overhead')),
            // Whether the graph acts on the analyser's per-track gain. Off
            // drops the amplify operator and any liq_amplify annotation
            // becomes inert — the kill switch for loudness correction across
            // the fleet without touching a row.
            'applyAmplify' => (bool) config('liquidsoap.apply_amplify'),
            'crossfadeHigh' => (float) config('liquidsoap.crossfade_high_db'),
            'crossfadeMedium' => (float) config('liquidsoap.crossfade_medium_db'),
            'crossfadeMargin' => (float) config('liquidsoap.crossfade_margin_db'),
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

        // Shared, not per-station, but ensured here because this is the only
        // path that runs before a `docker run`. Without it Docker creates the
        // bind-mount source itself, as root:root — and then the clip an
        // operator drops in later may not be readable by Liquidsoap's UID 100.
        // Cheap: ensureDirectoryExists is a no-op once it exists.
        File::ensureDirectoryExists($this->systemDir);

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
