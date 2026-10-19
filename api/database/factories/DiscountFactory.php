<?php

namespace Database\Factories;

use App\Models\Discount;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Discount>
 */
class DiscountFactory extends Factory
{
    protected $model = Discount::class;

    /**
     * A single-use 25%-off coupon, the founder shape.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => 'Founder price',
            'code' => strtoupper(fake()->unique()->bothify('FOUNDER-????')),
            'percent_off' => 25,
            'amount_off_usd' => null,
            'max_redemptions' => 1,
            'active' => true,
        ];
    }

    /** No code: applies to everyone while it runs. */
    public function sale(): static
    {
        return $this->state(['code' => null, 'max_redemptions' => null]);
    }

    public function amountOff(float $usd): static
    {
        return $this->state(['percent_off' => null, 'amount_off_usd' => $usd]);
    }
}
