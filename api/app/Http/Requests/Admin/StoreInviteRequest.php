<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a new invite link.
 *
 * Everything here has a sensible default on the form (Pro, no plan end date,
 * single use, link never expires), so the only field an admin has to think
 * about is the label — and that one is optional too, because a code minted for
 * a social post has nobody's name to carry.
 */
class StoreInviteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user('admin') !== null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Optional readable code, so a personal link can say DJRAE rather
            // than twenty random characters. Blank falls back to a generated
            // one. Letters, digits and hyphens only, because it lives in a
            // URL and gets read aloud. The minimum length is the guessability
            // floor: the public lookup answers "valid / not valid", and a
            // three-letter code would be found by anyone who tried. MySQL's
            // default collation makes the unique check case-insensitive, so
            // `djrae` and `DJRAE` are the same code — which is what you want
            // when someone types it from a screenshot.
            'code' => ['nullable', 'string', 'min:6', 'max:40', 'regex:/^[A-Za-z0-9-]+$/', 'unique:invites,code'],
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            // Days the granted plan lasts. Blank means open-ended, which is
            // the honest default while there is nothing for it to convert to.
            'duration_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'label' => ['nullable', 'string', 'max:255'],
            'max_uses' => ['required', 'integer', 'min:1', 'max:10000'],
            // How long the LINK stays redeemable, in days from now. Separate
            // from duration_days — see the create_invites_table migration.
            'link_expires_in_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.regex' => 'Use letters, numbers and hyphens only — no spaces.',
            'code.min' => 'Make the code at least 6 characters, or it can be guessed.',
            'code.unique' => 'That code is already in use. Pick another, or close the old invite first.',
        ];
    }
}
