<?php

namespace App\Console\Commands;

use App\Services\AdminTelegram;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Reads what nginx logged since the last run and alerts on two patterns from
 * the 2026-10-27 probe that never reach PHP's own logs in a useful shape:
 *
 *  - one address collecting many 4xx responses (a path sweep, credential
 *    guessing, an IDOR walk), and
 *  - one address repeatedly refused with 444 for connecting to the origin
 *    without going through Cloudflare.
 *
 * Incremental: the byte offset and inode of each file are kept in the cache,
 * so each run reads only new lines. A file seen for the first time is read
 * from its end (history is not news), and a rotated file — new inode, or
 * shorter than the saved offset — is read from the start.
 *
 * Needs read access to /var/log/nginx: on the native host the run user is in
 * the `adm` group (setup-native.sh). A file it cannot read is reported in the
 * command output and skipped, never fatal.
 */
class ScanAccessLogs extends Command
{
    protected $signature = 'security:scan-access-logs';

    protected $description = 'Alert on per-IP 4xx storms and blocked direct-to-origin connections in the nginx logs';

    /**
     * Matches nginx's default `combined` format up to the status code:
     * `1.2.3.4 - - [27/Oct/2026:15:58:01 +0100] "GET /x HTTP/1.1" 404 …`.
     */
    private const LINE = '/^(\S+) \S+ \S+ \[[^\]]+\] "(?:[^"\\\\]|\\\\.)*" (\d{3}) /';

    public function handle(AdminTelegram $telegram): int
    {
        /** @var list<string> $errorFiles */
        $errorFiles = config('security.access_logs.files', []);
        /** @var list<string> $blockedFiles */
        $blockedFiles = config('security.access_logs.blocked_files', []);

        $errors = [];
        $blocked = [];

        foreach (array_unique([...$errorFiles, ...$blockedFiles]) as $file) {
            foreach ($this->newLines($file) as $line) {
                if (preg_match(self::LINE, $line, $m) !== 1) {
                    continue;
                }

                [, $ip, $status] = $m;
                $status = (int) $status;

                if ($status === 444) {
                    if (in_array($file, $blockedFiles, true)) {
                        $blocked[$ip] = ($blocked[$ip] ?? 0) + 1;
                    }
                } elseif ($status >= 400 && $status < 500 && $status !== 401 && in_array($file, $errorFiles, true)) {
                    $errors[$ip] = ($errors[$ip] ?? 0) + 1;
                }
            }
        }

        $this->reportOffenders($telegram, $errors, (int) config('security.access_logs.errors_per_ip'), 'errors',
            '🚨 <b>Error storm from one address</b>', 'error responses (4xx, not 401)');

        $this->reportOffenders($telegram, $blocked, (int) config('security.access_logs.blocked_per_ip'), 'blocked',
            '🚨 <b>Direct-to-origin attempts</b>', 'connections refused for bypassing Cloudflare (444)');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, int>  $counts
     */
    private function reportOffenders(AdminTelegram $telegram, array $counts, int $threshold, string $kind, string $title, string $what): void
    {
        arsort($counts);

        foreach ($counts as $ip => $count) {
            if ($count < $threshold) {
                break;
            }

            $this->warn("{$ip}: {$count} {$what}");

            $telegram->opsAlert(
                "access-log-{$kind}:{$ip}",
                "{$title}\n"
                ."<code>{$this->e($ip)}</code>: {$count} {$what} in the last scan.\n"
                ."Block with <code>ufw insert 1 deny from {$this->e($ip)}</code>.",
                60,
            );
        }
    }

    /**
     * Lines appended to `$file` since the previous run.
     *
     * @return list<string>
     */
    private function newLines(string $file): array
    {
        if (! is_file($file) || ! is_readable($file)) {
            $this->line("Skipping {$file}: missing or not readable.");

            return [];
        }

        $stat = stat($file);
        if ($stat === false) {
            return [];
        }

        $key = 'security:access-log:'.md5($file);
        $previous = Cache::get($key);
        $size = (int) $stat['size'];
        $inode = (int) $stat['ino'];

        if (! is_array($previous)) {
            Cache::forever($key, ['inode' => $inode, 'offset' => $size]);

            return [];
        }

        $offset = ($previous['inode'] === $inode && $previous['offset'] <= $size) ? (int) $previous['offset'] : 0;

        // Bounded read: skip ahead rather than read a flood in one pass.
        $maxBytes = (int) config('security.access_logs.max_bytes');
        if ($size - $offset > $maxBytes) {
            $offset = $size - $maxBytes;
        }

        $handle = fopen($file, 'rb');
        if ($handle === false) {
            return [];
        }

        fseek($handle, $offset);
        $chunk = (string) stream_get_contents($handle, $size - $offset);
        fclose($handle);

        // Keep a trailing partial line for the next run.
        $lastNewline = strrpos($chunk, "\n");
        $consumed = $lastNewline === false ? 0 : $lastNewline + 1;

        Cache::forever($key, ['inode' => $inode, 'offset' => $offset + $consumed]);

        if ($consumed === 0) {
            return [];
        }

        return explode("\n", substr($chunk, 0, $consumed - 1));
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
