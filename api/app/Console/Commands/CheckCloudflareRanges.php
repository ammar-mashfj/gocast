<?php

namespace App\Console\Commands;

use App\Services\AdminTelegram;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Compares the Cloudflare ranges installed in nginx with the ones Cloudflare
 * publishes, and alerts on any difference.
 *
 * Since 2026-10-27 the public vhosts close every connection that does not come
 * from a Cloudflare edge (conf.d/cloudflare-realip.conf). A range Cloudflare
 * adds and we lack means real visitors routed through it get 444 — an outage
 * that looks like nothing in our own logs but a few refused connections.
 *
 * Alert only, never an edit: a bad fetch rewriting the allowlist would lock
 * everyone out. The fix is to update infra/native/nginx/cloudflare-realip.conf,
 * copy it to /etc/nginx/conf.d/ and reload nginx.
 *
 * The file holds the ranges twice (set_real_ip_from and the geo block); a
 * mismatch between those two is reported as well.
 */
class CheckCloudflareRanges extends Command
{
    protected $signature = 'security:check-cloudflare-ranges';

    protected $description = 'Alert when nginx\'s Cloudflare ranges differ from the ones Cloudflare publishes';

    public function handle(AdminTelegram $telegram): int
    {
        $path = (string) config('security.cloudflare_realip_conf');

        if (! is_file($path) || ! is_readable($path)) {
            $this->info("{$path} is not installed here; nothing to check.");

            return self::SUCCESS;
        }

        try {
            $published = [];
            foreach (['https://www.cloudflare.com/ips-v4', 'https://www.cloudflare.com/ips-v6'] as $url) {
                $body = Http::connectTimeout(5)->timeout(15)->retry(2, 1000)->get($url)->throw()->body();
                $published = [...$published, ...$this->ranges($body)];
            }
        } catch (Throwable $e) {
            $this->warn('Could not fetch the published ranges: '.$e->getMessage());

            return self::SUCCESS;
        }

        // An empty or garbled response must not read as "remove everything".
        if (count($published) < 10) {
            $this->warn('The published lists look incomplete ('.count($published).' ranges); not comparing.');

            return self::SUCCESS;
        }

        $installed = (string) file_get_contents($path);
        $realIp = $this->ranges(implode("\n", preg_match_all('/^\s*set_real_ip_from\s+(\S+);/m', $installed, $m) ? $m[1] : []));
        $geo = $this->ranges(implode("\n", preg_match_all('/^\s*(\S+\/\d+)\s+1;/m', $installed, $m) ? $m[1] : []));

        // Loopback is in the geo block on purpose, for tooling on the box.
        $geo = array_values(array_diff($geo, ['127.0.0.1/32', '::1/128']));

        $missing = array_values(array_diff($published, $realIp));
        $extra = array_values(array_diff($realIp, $published));
        $drift = array_values(array_merge(array_diff($realIp, $geo), array_diff($geo, $realIp)));

        if ($missing === [] && $extra === [] && $drift === []) {
            $this->info('Installed Cloudflare ranges match the published lists ('.count($published).').');

            return self::SUCCESS;
        }

        $lines = [];
        if ($missing !== []) {
            $lines[] = 'Missing (visitors via these get 444): <code>'.implode(' ', $missing).'</code>';
        }
        if ($extra !== []) {
            $lines[] = 'No longer published: <code>'.implode(' ', $extra).'</code>';
        }
        if ($drift !== []) {
            $lines[] = 'set_real_ip_from and geo lists disagree on: <code>'.implode(' ', $drift).'</code>';
        }

        $this->warn(strip_tags(implode("\n", $lines)));

        $telegram->opsAlert(
            'cloudflare-ranges',
            "⚠️ <b>Cloudflare ranges changed</b>\n".implode("\n", $lines)."\n"
            .'Update <code>infra/native/nginx/cloudflare-realip.conf</code>, copy it to <code>/etc/nginx/conf.d/</code>, then <code>nginx -t &amp;&amp; systemctl reload nginx</code>.',
            60 * 24,
        );

        return self::SUCCESS;
    }

    /**
     * @return list<string>
     */
    private function ranges(string $text): array
    {
        $ranges = array_filter(array_map(
            fn (string $line) => strtolower(trim($line)),
            preg_split('/\s+/', $text) ?: [],
        ), fn (string $range) => preg_match('#^[0-9a-f:.]+/\d{1,3}$#', $range) === 1);

        return array_values(array_unique($ranges));
    }
}
