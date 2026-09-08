<?php

namespace App\Http\Controllers;

use App\Http\Resources\StationResource;
use App\Models\Station;

/**
 * The station payload behind `/embed/{slug}` on the web app.
 *
 * A separate endpoint rather than an `embed_enabled` field on the public
 * station resource, for the same reason `watermarked` is owner-only there:
 * a per-station plan flag on `/public/stations` and `/discover` would tell
 * the whole internet which stations are on the free plan, and reading the
 * owner's plan per row would put an N+1 into a resource that is deliberately
 * N+1-free. Here there is exactly one station, so one extra query is the
 * whole cost.
 *
 * 404, not 403, for a station whose owner cannot embed. The embed page has
 * nothing to render either way, and a 403 would confirm to a stranger that
 * the slug exists and is on the free plan — the same leak the field would
 * have been. The dashboard already tells the owner why, from UserResource.
 */
class PublicEmbedController extends Controller
{
    public function show(string $slug): StationResource
    {
        $station = Station::query()
            ->where('slug', $slug)
            ->with('user.plan')
            ->first();

        // One abort for both cases, deliberately — firstOrFail() would name
        // the model in its 404 message, and the difference between that body
        // and this one is exactly the "exists but free" signal being hidden.
        // `user` is nullable for a station whose owner was deleted: no owner,
        // no plan, no embed.
        abort_unless($station?->user?->canEmbed(), 404);

        return new StationResource($station);
    }
}
