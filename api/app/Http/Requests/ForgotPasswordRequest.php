<?php

namespace App\Http\Requests;

use App\Services\Turnstile;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Request a password-reset code be emailed.
 *
 * Public endpoint — no auth. Controller always returns 200 regardless of
 * whether the email exists, to prevent account enumeration.
 */
class ForgotPasswordRequest extends FormRequest
{
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
            // Every accepted request can send an email; this keeps a script
            // from mailing an inbox from many IPs at once.
            'turnstile_token' => Turnstile::rules(),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return Turnstile::messages();
    }
}
