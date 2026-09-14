<?php

namespace App\Notifications\Bell;

use Illuminate\Notifications\Notification;

/**
 * Base class for anything that should appear in the dashboard bell.
 *
 * Extend this, implement {@see self::toBell()}, and the notification is
 * renderable by a front end that knows nothing about it — see BellPayload for
 * why that works. Nothing else is required: no client change, no registry to
 * add the class to, no migration.
 *
 * WHY A BASE CLASS AND NOT JUST `toDatabase()`. Laravel is happy to store any
 * array you hand it, which means the contract in BellPayload would hold exactly
 * until the first person in a hurry wrote `toDatabase()` by hand and returned
 * `['message' => '...']`. That row is unrenderable, and it is unrenderable
 * forever — rows are not migrated, so a client that has to cope with it has to
 * cope with it permanently. So `toDatabase()` is final here, the payload is the
 * only way through it, and ArchitectureTest refuses any notification that uses
 * the database channel without extending this class. The contract is enforced
 * at the two moments it can be: writing the class, and running the tests.
 *
 * CHANNELS. `via()` is final and answers `['database']` plus whatever
 * {@see self::alsoVia()} adds, which is the seam a per-user preference will
 * eventually plug into — one override, rather than every subclass growing its
 * own copy of the preference lookup. A notification that is bell-only says
 * nothing; one that also emails says `['mail']`.
 *
 * QUEUEING. Not decided here, because it genuinely differs. A bell-only
 * notification is a single insert and should be synchronous, so the row is
 * there by the time the request that caused it returns and the next poll picks
 * it up. One that also sends mail should implement ShouldQueue, because a slow
 * mail host must not hold up the request — at the cost of the bell row landing
 * a moment later too, since Laravel queues the notification as a whole rather
 * than per channel.
 */
abstract class BellNotification extends Notification
{
    /**
     * Build the in-app payload.
     */
    abstract protected function toBell(object $notifiable): BellPayload;

    /**
     * Channels beyond the bell. Override to add `'mail'`.
     *
     * @return list<string>
     */
    protected function alsoVia(object $notifiable): array
    {
        return [];
    }

    /**
     * @return list<string>
     */
    final public function via(object $notifiable): array
    {
        return array_values(array_unique(['database', ...$this->alsoVia($notifiable)]));
    }

    /**
     * @return array<string, mixed>
     */
    final public function toDatabase(object $notifiable): array
    {
        return $this->toBell($notifiable)->toArray();
    }
}
