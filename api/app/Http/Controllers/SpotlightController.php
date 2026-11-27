<?php

namespace App\Http\Controllers;

use App\Models\Spotlight;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The dashboard's spotlight dialog: what to open, and what the account did
 * with it.
 *
 * Who sees what is decided here, on every request (see Spotlight::visibleTo),
 * which is the whole reason this is not the bell. An action is only accepted
 * on a spotlight the caller can see right now, so a key that is guessed, or
 * one whose sale has just ended, answers 404 rather than writing a row.
 */
class SpotlightController extends Controller
{
    /**
     * What the account did → the column that records it.
     */
    private const ACTIONS = [
        'seen' => 'seen_at',
        'minimize' => 'minimized_at',
        'click' => 'clicked_at',
    ];

    /**
     * Every spotlight this account should still have, most important first.
     *
     * `state` is what the dashboard needs to decide: `new` opens as a dialog,
     * `minimized` sits as a chip.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $spotlights = Spotlight::visibleTo($user);
        $states = $this->statesFor($user, $spotlights);

        $data = $spotlights
            ->map(fn (Spotlight $spotlight) => [
                'key' => $spotlight->key,
                'kind' => $spotlight->kind,
                'title' => $spotlight->title,
                // The minimised chip's text; the title when none was written.
                'chip_label' => $spotlight->chip_label ?: $spotlight->title,
                'body_html' => $spotlight->bodyHtml(),
                'image_url' => $spotlight->imageUrl(),
                'cta_label' => $spotlight->cta_label,
                'cta_url' => $spotlight->cta_url,
                'ends_at' => $spotlight->ends_at?->toIso8601String(),
                'state' => $states->get($spotlight->id)?->minimized_at !== null ? 'minimized' : 'new',
                // Shown to a tester while it is still a draft, so the dialog
                // can say so instead of looking live.
                'preview' => ! ($spotlight->isRunning() && $spotlight->matchesAudience($user)),
            ])
            ->values();

        return response()->json(['data' => $data]);
    }

    /**
     * Record one action. The first time of each is kept: "when did they
     * first click" is the number worth having, and re-opening from the chip
     * then minimising again should not move it.
     *
     * Opening a minimised one again from the chip clears nothing: it stays
     * minimised, so a reload brings back the chip and not the dialog.
     */
    public function record(Request $request, string $key, string $action): Response
    {
        $column = self::ACTIONS[$action] ?? abort(404);

        /** @var User $user */
        $user = $request->user();
        $spotlight = Spotlight::visibleTo($user)->firstWhere('key', $key) ?? abort(404);

        $now = now();
        DB::table('spotlight_user')->insertOrIgnore([
            'spotlight_id' => $spotlight->id,
            'user_id' => $user->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('spotlight_user')
            ->where('spotlight_id', $spotlight->id)
            ->where('user_id', $user->id)
            ->whereNull($column)
            ->update([$column => $now, 'updated_at' => $now]);

        return response()->noContent();
    }

    /**
     * @param  Collection<int, Spotlight>  $spotlights
     * @return Collection<int, object{spotlight_id: int, minimized_at: ?string}>
     */
    private function statesFor(User $user, Collection $spotlights): Collection
    {
        if ($spotlights->isEmpty()) {
            return collect();
        }

        return DB::table('spotlight_user')
            ->where('user_id', $user->id)
            ->whereIn('spotlight_id', $spotlights->pluck('id'))
            ->get(['spotlight_id', 'minimized_at'])
            ->keyBy('spotlight_id');
    }
}
