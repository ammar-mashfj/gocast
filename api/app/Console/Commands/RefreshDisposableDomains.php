<?php

namespace App\Console\Commands;

use App\Services\AdminTelegram;
use App\Services\DisposableEmail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Downloads the maintained throwaway-domain list and writes it, merged with
 * our own additions, to config('security.disposable_domains_list'), which
 * DisposableEmail reads in preference to the copy bundled with the code.
 *
 * The file on disk is only replaced by a download that looks whole: a failed
 * request, an error page served as 200, or a list far shorter than the one we
 * have leaves the current file alone and alerts instead. An empty list would
 * silently let every throwaway address back in.
 */
class RefreshDisposableDomains extends Command
{
    protected $signature = 'email:refresh-disposable';

    protected $description = 'Refresh the list of throwaway email domains refused at sign-up';

    /** The maintained list has had ~10,000 entries since 2025. */
    public const MIN_DOMAINS = 5000;

    public function handle(AdminTelegram $telegram): int
    {
        $source = (string) config('security.disposable_domains_source');
        $target = (string) config('security.disposable_domains_list');

        try {
            $body = Http::connectTimeout(5)->timeout(30)->retry(2, 1000)->get($source)->throw()->body();
        } catch (Throwable $e) {
            return $this->refuse($telegram, 'Could not download the list: '.$e->getMessage());
        }

        $downloaded = $this->domains($body);
        $current = DisposableEmail::readList(is_file($target) ? $target : resource_path('data/disposable-email-domains.txt'));

        // Half of what we have guards against a truncated file that still
        // clears the floor.
        if (count($downloaded) < self::MIN_DOMAINS || count($downloaded) < count($current) / 2) {
            return $this->refuse($telegram, 'The download looks incomplete ('.count($downloaded).' domains, '.count($current).' on file); keeping the current list.');
        }

        $ours = array_keys(DisposableEmail::readList(DisposableEmail::oursPath()));
        $merged = array_values(array_unique([...$downloaded, ...$ours]));
        sort($merged);

        $contents = '# Written by `php artisan email:refresh-disposable` on '.now()->toDateTimeString()."; do not edit.\n"
            ."# {$source} merged with resources/data/disposable-email-domains-ours.txt.\n"
            .implode("\n", $merged)."\n";

        // Write beside the target and rename over it, so a sign-up never
        // reads a half-written file.
        $temp = $target.'.tmp';

        if (@file_put_contents($temp, $contents) === false || ! @rename($temp, $target)) {
            @unlink($temp);

            return $this->refuse($telegram, "Could not write {$target}.");
        }

        DisposableEmail::forgetLists();

        $added = count(array_diff($merged, array_keys($current)));
        $this->info('Wrote '.count($merged)." domains to {$target} ({$added} new).");

        return self::SUCCESS;
    }

    private function refuse(AdminTelegram $telegram, string $reason): int
    {
        $this->error($reason);

        $telegram->opsAlert(
            'disposable-domains',
            "⚠️ <b>Throwaway-domain list not refreshed</b>\n".e($reason),
            60 * 24,
        );

        return self::FAILURE;
    }

    /**
     * @return list<string>
     */
    private function domains(string $body): array
    {
        $domains = [];

        foreach (preg_split('/\R/', $body) ?: [] as $line) {
            $line = strtolower(trim($line));

            if (preg_match('/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,}$/', $line)) {
                $domains[$line] = true;
            }
        }

        return array_keys($domains);
    }
}
