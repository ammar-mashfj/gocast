<?php

namespace Database\Factories;

use App\Models\LavaPayment;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LavaPayment>
 */
class LavaPaymentFactory extends Factory
{
    protected $model = LavaPayment::class;

    /**
     * An open lava.top payment for a 3-month Pro pack at $52.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'kind' => LavaPayment::KIND_PACK,
            'product_name' => 'Pro · 3 months',
            'plan_id' => fn () => Plan::where('slug', 'pro')->value('id'),
            'duration_unit' => 'month',
            'duration_count' => 3,
            'list_price_usd' => 52,
            'discount_usd' => 0,
            'amount_usd' => 52,
            'email' => fn (array $attributes) => User::find($attributes['user_id'])?->email ?? fake()->safeEmail(),
            'contract_id' => (string) Str::uuid(),
            'payment_url' => 'https://app.lava.top/pay/test',
            'status' => LavaPayment::STATUS_NEW,
        ];
    }

    /** The first payment of the $20 monthly membership. */
    public function membership(): static
    {
        return $this->state([
            'kind' => LavaPayment::KIND_MEMBERSHIP,
            'product_name' => 'Pro · 1 month',
            'duration_count' => 1,
            'list_price_usd' => 20,
            'amount_usd' => 20,
        ]);
    }
}
