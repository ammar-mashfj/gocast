<?php

namespace Database\Factories;

use App\Models\LavaSale;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LavaSale>
 */
class LavaSaleFactory extends Factory
{
    protected $model = LavaSale::class;

    /**
     * A first monthly subscription charge of $20, not yet tied to an account.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $contractId = (string) Str::uuid();
        $email = fake()->unique()->safeEmail();

        return [
            'contract_id' => $contractId,
            'event_type' => 'payment.success',
            'product_id' => config('services.lava.subscription_product_id'),
            'email' => $email,
            'user_id' => null,
            'amount' => '20.00',
            'currency' => 'USD',
            'months' => 1,
            'payload' => [
                'eventType' => 'payment.success',
                'contractId' => $contractId,
                'product' => ['id' => config('services.lava.subscription_product_id')],
                'buyer' => ['email' => $email],
                'amount' => 20,
                'currency' => 'USD',
            ],
        ];
    }
}
