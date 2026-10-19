<?php

namespace Database\Factories;

use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Payment>
 */
class PaymentFactory extends Factory
{
    protected $model = Payment::class;

    /**
     * An open invoice for a month of Pro at $20.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'product_name' => 'Pro · 1 month',
            'grant_type' => 'plan_term',
            'plan_id' => fn () => Plan::where('slug', 'pro')->value('id'),
            'duration_unit' => 'month',
            'duration_count' => 1,
            'list_price_usd' => 20,
            'discount_usd' => 0,
            'amount_usd' => 20,
            'track_id' => (string) fake()->unique()->numberBetween(100000000, 999999999),
            'payment_url' => 'https://pay.oxapay.com/test',
            'status' => Payment::STATUS_WAITING,
            'invoice_expires_at' => now()->addHour(),
        ];
    }

    /** Paid and granted, ending $until. */
    public function granted(\DateTimeInterface $until): static
    {
        return $this->state([
            'status' => Payment::STATUS_PAID,
            'paid_at' => now(),
            'granted_at' => now()->subDays(20),
            'granted_until' => $until,
        ]);
    }
}
