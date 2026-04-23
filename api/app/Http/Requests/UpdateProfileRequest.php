<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Update the authenticated user's name and/or email.
 *
 * Email change clears email_verified_at, issues a new verification code, and
 * notifies the old address — enforced in the controller. Current password is
 * required when email changes to prevent a session-hijack from pivoting into
 * a full takeover (change email → request reset → change password).
 */
class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $userId = $this->user()->id;
        $emailChanging = $this->has('email') && $this->string('email')->value() !== $this->user()->email;

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users')->ignore($userId)],
            'current_password' => [Rule::requiredIf($emailChanging), 'string', 'current_password'],
        ];
    }
}
