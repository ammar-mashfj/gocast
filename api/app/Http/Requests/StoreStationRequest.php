<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreStationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $maxStations = config('plans.free.max_stations');

        foreach (config('plans') as $plan => $limits) {
            if ($user->stations()->where('plan', $plan)->exists()) {
                $maxStations = max($maxStations, $limits['max_stations']);
            }
        }

        return $user->stations()->count() < $maxStations;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'slug' => ['required', 'string', 'max:60', 'unique:stations', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'description' => ['nullable', 'string'],
            'genre' => ['nullable', 'string', 'max:255'],
        ];
    }
}
