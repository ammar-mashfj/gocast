<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The signed-in user, plus the entitlements the dashboard needs to decide
 * what to show before the API says no.
 *
 * This exists because the front end had no plan awareness at all: the only
 * plan-derived value it could see was `station.watermarked`, so the AutoDJ
 * nav item looked live on a free account and the first time anyone learned
 * otherwise was a 403 on their first upload.
 *
 * `plan` is deliberately a flat block of ANSWERS, not the plans row. The
 * client should never be in the business of deriving "can I do this" from
 * columns — that logic belongs to StationLifecycleService, and shipping the
 * raw row would invite a second, drifting copy of it in TypeScript.
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'avatar_url' => $this->avatar_url,
            'google_id' => $this->google_id,
            'has_password' => $this->has_password,
            'stripe_customer_id' => $this->stripe_customer_id,
            'email_verified_at' => $this->email_verified_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'plan' => [
                'slug' => $this->plan?->slug ?? 'free',
                'name' => $this->plan?->name ?? 'Free',
                // A user with no plan row is treated as free everywhere else
                // (see StationLifecycleService::autoDjEnabled), and the null
                // coalescing here has to agree with that or the UI would
                // unlock a feature the API refuses.
                'autodj_enabled' => (bool) ($this->plan?->autodj_enabled ?? false),
                // Days of audience history this plan may see. 0 is the free
                // tier: live listeners and the all-time peak, no window. The
                // sidebar badges the Audience item from this; the payload of
                // AudienceController is what actually enforces it.
                'analytics_days' => (int) ($this->plan?->analytics_days ?? 0),
                'max_listeners' => (int) ($this->plan?->max_listeners ?? 0),
                'watermarked' => $this->watermarked(),
            ],
        ];
    }
}
