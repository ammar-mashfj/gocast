<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Validates a hand-provisioned account: the person, their plan, and the one
 * station they start with.
 *
 * Deliberately stricter than RegisterRequest in one place and looser in
 * another. Stricter: `plan_id` has to name a real row, because the whole point
 * of this form is granting a paid plan and a bad id here would silently create
 * a free account that looks paid in the confirmation message. Looser: no
 * password confirmation, since the plaintext is echoed back on the next screen
 * — a typo is visible there rather than discovered by the account holder
 * failing to log in.
 */
class StoreAccountRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            // `unique:users` counts soft-deleted rows, which is what we want —
            // the column carries a unique index and a closed account still
            // occupies its address. withValidator() below turns that case into
            // a message that says so rather than a bare "already taken".
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            // Required, and never generated: this password is the only way
            // into the account, and the person it belongs to hears it from
            // you. Min matches RegisterRequest so a provisioned account is not
            // held to a different standard than a self-served one.
            'password' => ['required', 'string', 'min:8'],
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            // Mirrors StoreStationRequest — same column, same limit.
            'station_name' => ['required', 'string', 'max:100'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (! $validator->errors()->has('email')) {
                return;
            }

            $email = (string) $this->input('email');

            // Distinguish the two collisions. "Someone already has this" sends
            // you to the Access requests page; "this belonged to a closed
            // account" is a dead end that needs the row restoring first, and
            // guessing wrong between them wastes a real support round trip.
            if (User::onlyTrashed()->where('email', $email)->exists()) {
                $validator->errors()->forget('email');
                $validator->errors()->add(
                    'email',
                    "{$email} belongs to a closed account. Its row still holds the address, so it cannot be reused here."
                );
            } elseif (User::where('email', $email)->exists()) {
                $validator->errors()->forget('email');
                $validator->errors()->add(
                    'email',
                    "{$email} already has an account. Move it onto a plan from Access requests instead — this form only creates new accounts."
                );
            }
        });
    }
}
