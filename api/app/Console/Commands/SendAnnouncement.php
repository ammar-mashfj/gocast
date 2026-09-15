<?php

namespace App\Console\Commands;

use App\Notifications\Bell\BellPayload;
use App\Notifications\ProductUpdate;
use App\Services\AnnouncementInProgressException;
use App\Services\AnnouncementSender;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;
use InvalidArgumentException;
use JsonException;
use stdClass;

/**
 * Send one announcement to every account.
 *
 * Reads its copy from a JSON file rather than from options, and the reason is
 * the copy itself: an announcement is two or three sentences and a handful of
 * bullets, written and reread before it goes out, and passing that through a
 * shell means apostrophes escaped by hand on the one command in the product
 * that cannot be taken back. A file is also a thing that can be diffed,
 * reviewed and kept — `docs/announcements/2026-09-embed-player.json` is a record of
 * what was said, which options typed into a terminal are not.
 *
 * The file's shape is ProductUpdate::fromArray(); `docs/announcements/example.json`
 * is a filled-in template.
 *
 * When the admin panel grows a page for this, it composes the same array from
 * a form and hands it to the same sender. Nothing here is the mechanism — see
 * AnnouncementSender, which is.
 */
#[Signature('notifications:announce
    {file : Path to a JSON file holding the announcement}
    {--dry-run : Show who would be notified and what they would see, send nothing}
    {--force : Skip the confirmation prompt}')]
#[Description('Send an announcement to the in-app bell of every account')]
class SendAnnouncement extends Command
{
    public function handle(AnnouncementSender $sender): int
    {
        try {
            $update = ProductUpdate::fromArray($this->readFile());
        } catch (InvalidArgumentException|JsonException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        // Previewed before anything is counted, let alone sent. The failure
        // this catches is not a crash: it is a typo in the headline that every
        // account on the platform reads, and the only moment to catch it is
        // while it is still on this screen.
        $this->preview($update);

        // Counted before anything is asked, because telling somebody how many
        // people they are about to write to BEFORE they say yes is the only
        // version of the question worth asking. Two counting queries rather
        // than a second walk of the user table — see AnnouncementSender::plan.
        $planned = $sender->plan($update);
        $pending = $planned['pending'];

        $this->line('');
        $this->line("Accounts: <fg=cyan>{$planned['audience']}</> — "
            ."<fg=cyan>{$pending}</> to notify, <fg=cyan>{$planned['skipped']}</> already have it.");

        if ($this->option('dry-run')) {
            $this->info('Dry run — nothing was sent.');

            return self::SUCCESS;
        }

        if ($pending === 0) {
            $this->info("Everybody already has [{$update->key}]. Nothing to do.");

            return self::SUCCESS;
        }

        // `force` rather than a bare confirm, because this command will end up
        // in a deploy script eventually and a prompt that blocks forever in CI
        // is how people learn to pass --no-interaction to everything.
        $question = 'Send this to '.$pending.' '.Str::plural('account', $pending).'? It cannot be undone.';

        if (! $this->option('force') && ! $this->confirm($question)) {
            $this->info('Cancelled.');

            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($pending);
        $bar->start();

        try {
            $result = $sender->send($update, onUser: function ($user, bool $skipped) use ($bar) {
                if (! $skipped) {
                    $bar->advance();
                }
            });
        } catch (AnnouncementInProgressException $e) {
            // A second terminal, or a send started from the admin panel. Both
            // are already doing this job, so this run stands down rather than
            // racing it — see AnnouncementSender for why that matters.
            $this->line('');
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $bar->finish();
        $this->line('');

        // The key is echoed back because it is what somebody types to resume:
        // if this run dies halfway, the same command sends only the remainder,
        // and the guard that makes that true keys off this string.
        $this->info("Sent [{$update->key}] to {$result['sent']} ".Str::plural('account', $result['sent'])
            .($result['skipped'] > 0 ? ", skipped {$result['skipped']} who already had it." : '.'));

        return self::SUCCESS;
    }

    /**
     * @return array<string, mixed>
     *
     * @throws InvalidArgumentException|JsonException
     */
    private function readFile(): array
    {
        $path = (string) $this->argument('file');

        if (! is_file($path)) {
            throw new InvalidArgumentException("No announcement file at [{$path}].");
        }

        // JSON_THROW_ON_ERROR rather than checking for null: a file with a
        // trailing comma decodes to null, and a null that reaches fromArray()
        // reports a missing headline, which sends whoever is holding the
        // terminal looking for a field that is right there in front of them.
        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($decoded)) {
            throw new InvalidArgumentException("[{$path}] does not contain a JSON object.");
        }

        return $decoded;
    }

    /**
     * Show the announcement as the bell will render it.
     *
     * Built through the notification rather than re-read from the file, so
     * what is shown here is what will actually be stored — including the
     * defaults nobody wrote down, which are exactly the parts worth seeing
     * before sending. A preview of the input would agree with the file and
     * disagree with the product.
     */
    private function preview(ProductUpdate $update): void
    {
        // stdClass because the payload does not depend on the recipient —
        // see ProductUpdate::buildPayload(), which reads nothing off it. A real
        // user here would suggest the preview is one person's view of the
        // announcement, and it is not.
        /** @var array<string, mixed> $payload */
        $payload = $update->toDatabase(new stdClass);
        $action = $payload['action'];

        $this->line('');
        $this->line("  <options=bold>{$payload['title']}</>");

        if ($payload['body'] !== null) {
            $this->line("  {$payload['body']}");
        }

        if ($action['detail'] !== null) {
            $this->line('');
            $this->line("  <fg=gray>{$action['detail']['heading']}</>");

            foreach ($action['detail']['points'] as $point) {
                $this->line("    • {$point}");
            }
        }

        $this->line('');
        $this->line("  [ {$action['label']} ] <fg=gray>{$action['url']}</>");
        $this->line('');
        $this->line("  <fg=gray>key: {$update->key} · level: {$payload['level']} · icon: {$payload['icon']}"
            .' · opens: '.($action['mode'] === BellPayload::MODE_EXPAND ? 'a dialog' : 'the link').'</>');
    }
}
