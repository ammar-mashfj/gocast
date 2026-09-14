<?php

namespace App\Http\Resources;

use App\Notifications\Bell\BellPayload;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Notifications\DatabaseNotification;

/**
 * One row of the bell feed.
 *
 * Flattens the stored payload up to the top level rather than nesting it under
 * `data`, so the client reads `notification.title` instead of
 * `notification.data.title` — the envelope (id, read_at) and the payload are
 * one thing to whoever is rendering a row, and the split is an implementation
 * detail of how Laravel stores it.
 *
 * DEFENSIVE ON PURPOSE. Every field is coalesced. Rows are written once and
 * never migrated, so a payload written by a build that predates a field will
 * still be in this table long after every notification class has that field —
 * and a feed that 500s because one 2026 row lacks `category` is a worse outcome
 * than a feed with one uncategorised row in it. The same coalescing is what
 * lets the payload grow without a backfill.
 *
 * `type` is passed through for analytics and for the client's `key`, NOT for
 * rendering — see BellPayload. It is the fully-qualified class name, which is
 * fine to expose: it names a notification, not a route or a secret.
 *
 * @mixin DatabaseNotification
 */
class NotificationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var array<string, mixed> $data */
        $data = is_array($this->data) ? $this->data : [];

        return [
            'id' => $this->id,
            'type' => $this->type,
            'title' => $data['title'] ?? 'Notification',
            'body' => $data['body'] ?? null,
            'icon' => $data['icon'] ?? 'bell',
            'level' => $data['level'] ?? 'info',
            'category' => $data['category'] ?? 'system',
            // Normalised to null rather than passed through, because an older
            // row may carry a half-built action that BellPayload would now
            // refuse to construct.
            //
            // The same normalising is why `mode` and `detail` have to be named
            // here: this builds the action key by key, so a field nobody adds
            // is a field the client never sees — and the symptom is not an
            // error but a notification that quietly goes back to being an
            // ordinary link. Both default the way an older row reads.
            'action' => isset($data['action']['url'])
                ? [
                    'mode' => is_string($data['action']['mode'] ?? null)
                        ? $data['action']['mode']
                        : BellPayload::MODE_LINK,
                    'label' => $data['action']['label'] ?? 'Open',
                    'url' => $data['action']['url'],
                    'detail' => $this->detail($data['action']['detail'] ?? null),
                ]
                : null,
            'meta' => (object) ($data['meta'] ?? []),
            'read_at' => $this->read_at,
            'created_at' => $this->created_at,
        ];
    }

    /**
     * The detail an expanding action reveals, or null if there is nothing
     * renderable there.
     *
     * Filtered rather than trusted for the same reason the action above is:
     * these rows are never migrated, so this may be reading anything a past
     * build wrote. A detail whose points are missing, empty, or not strings
     * would render as a heading over a void, and the client's fallback for
     * "expands but has nothing to show" is to behave like a plain link — which
     * is the right outcome, but only if this says null rather than handing it
     * an empty list.
     *
     * @return array{heading: string|null, points: list<string>}|null
     */
    private function detail(mixed $detail): ?array
    {
        if (! is_array($detail) || ! is_array($detail['points'] ?? null)) {
            return null;
        }

        $points = array_values(array_filter(
            $detail['points'],
            fn (mixed $point): bool => is_string($point) && trim($point) !== '',
        ));

        if ($points === []) {
            return null;
        }

        return [
            'heading' => is_string($detail['heading'] ?? null) ? $detail['heading'] : null,
            'points' => $points,
        ];
    }
}
