<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the PUBLIC enquiry endpoint, POST /api/waitlist.
 *
 * Only Custom/enterprise enquiries come through here. Those legitimately
 * arrive from strangers — a network sizing us up should not have to create a
 * free station before it can talk to us — so the email is untrusted input and
 * stays that way.
 *
 * Pro is NOT accepted on this route; see StoreProAccessRequest. `plan` is
 * whitelisted rather than left free-form precisely so that a client posting
 * `plan: "pro"` here cannot route around the authenticated endpoint and land
 * an unverified email in the review queue.
 */
class StoreWaitlistRequest extends FormRequest
{
    /**
     * Plans anyone may enquire about without an account.
     *
     * @var list<string>
     */
    public const PUBLIC_PLANS = ['custom'];

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'plan' => ['required', 'string', Rule::in(self::PUBLIC_PLANS)],
            // Required: this is the qualifying field — it is how we check the
            // audience before inviting anyone. Still not `url`, because people
            // paste "instagram.com/x" without a scheme and that is fine.
            'social' => ['required', 'string', 'max:255'],
            'message' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
