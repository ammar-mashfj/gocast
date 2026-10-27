<?php

namespace App\Http\Requests;

use App\Rules\OwnStorageUrl;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates station creation.
 *
 * Enforces plan-based station limits in authorize() using the user's plan.
 */
class StoreStationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user->stations()->count() < $user->plan->max_stations;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'genre' => ['nullable', 'string', 'max:255'],
            // Our own storage only — see UpdateStationRequest and OwnStorageUrl.
            'artwork_url' => ['nullable', 'string', 'url:http,https', 'max:2048', new OwnStorageUrl],
        ];
    }
}
