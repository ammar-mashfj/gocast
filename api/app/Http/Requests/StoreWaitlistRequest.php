<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates waitlist signup for the public POST /api/waitlist endpoint.
 *
 * DNS-backed email validation adds a cheap barrier against disposable and typo'd
 * addresses on an unauthenticated endpoint whose only other defense is rate limiting.
 */
class StoreWaitlistRequest extends FormRequest
{
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
            'email' => ['required', 'string', 'email:rfc,dns', 'max:255'],
            'plan' => ['required', 'string', 'max:30'],
        ];
    }
}
