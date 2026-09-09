<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates new user registration via email and password.
 *
 * Requires password confirmation to prevent typos during sign-up.
 */
class RegisterRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            // Validated for shape only. Whether the code is real, unused and
            // in date is InviteRedemption's call, made inside the same
            // transaction as the insert so the answer cannot change between
            // here and there.
            'invite_code' => ['nullable', 'string', 'max:40'],
        ];
    }
}
