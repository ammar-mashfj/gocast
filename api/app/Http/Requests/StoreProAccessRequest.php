<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates POST /api/waitlist/pro, the authenticated Pro access request.
 *
 * Note what is absent: `email` and `plan`. Both are derived server-side from
 * the session rather than accepted from the body. That is the point of the
 * route — the old public form let anyone submit any address, which meant a
 * request could be filed for someone else, and because a resubmit updates the
 * row in place, a stranger could also overwrite a real applicant's answers.
 * An address that cannot be sent cannot be spoofed.
 */
class StoreProAccessRequest extends FormRequest
{
    /**
     * The `auth:sanctum` middleware on the route is the real gate; this is
     * only the FormRequest half of it.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Still required even though we can now see the requester's
            // stations: the station says what they broadcast, the link says
            // who is listening, and the second is what decides an invite.
            'social' => ['required', 'string', 'max:255'],
            'message' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
