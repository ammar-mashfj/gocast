<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Self-serve checkout: what we sell, what it costs today, and every attempt
 * to buy it.
 *
 * Prices live here, not in code, so a new term, a price change or a
 * limited-time sale is a form in the admin panel rather than a deploy:
 *
 * - `products`: one sellable thing ("Pro · 3 months") and what paying for it
 *   grants. `grant_type` names the code that applies it (App\Billing\Grants);
 *   only `plan_term` exists today.
 * - `discounts`: a coupon when it has a `code`, an automatic sale when it
 *   does not. No rows in `discount_product` means every product.
 * - `payments`: one checkout. Snapshots the price and what it grants at the
 *   moment of checkout, so editing a product later never rewrites what
 *   somebody already paid for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 60)->unique();
            $table->string('name', 80);
            $table->string('description', 255)->nullable();
            $table->string('badge', 40)->nullable();
            $table->decimal('price_usd', 10, 2);
            $table->string('grant_type', 30)->default('plan_term');
            $table->foreignId('plan_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('duration_unit', 10)->nullable();
            $table->unsignedSmallInteger('duration_count')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('visible')->default(true);
            $table->integer('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('discounts', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->string('code', 60)->nullable()->unique();
            $table->decimal('percent_off', 5, 2)->nullable();
            $table->decimal('amount_off_usd', 10, 2)->nullable();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->unsignedInteger('max_redemptions')->nullable();
            $table->unsignedInteger('per_user_limit')->nullable();
            $table->unsignedInteger('redemptions_count')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('discount_product', function (Blueprint $table) {
            $table->foreignId('discount_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->primary(['discount_id', 'product_id']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            // Kept when the account or product goes: a payment is a financial
            // record, and the snapshot columns below still say what it was.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('discount_id')->nullable()->constrained()->nullOnDelete();

            $table->string('product_name', 80);
            $table->string('grant_type', 30);
            $table->foreignId('plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('duration_unit', 10)->nullable();
            $table->unsignedSmallInteger('duration_count')->nullable();
            $table->decimal('list_price_usd', 10, 2);
            $table->string('discount_code', 60)->nullable();
            $table->decimal('discount_usd', 10, 2)->default(0);
            $table->decimal('amount_usd', 10, 2);

            $table->string('provider', 20)->default('oxapay');
            $table->boolean('sandbox')->default(false);
            $table->string('track_id', 64)->nullable()->unique();
            $table->text('payment_url')->nullable();
            $table->string('status', 20)->default('new')->index();
            $table->timestamp('invoice_expires_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('granted_until')->nullable();
            $table->string('review_reason', 255)->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('reminded_7d_at')->nullable();
            $table->timestamp('reminded_1d_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        // The four terms the payment email quoted, so checkout sells exactly
        // what customers were already offered. From here on they are edited
        // in /admin/billing/products.
        $pro = DB::table('plans')->where('slug', 'pro')->value('id');

        if ($pro !== null) {
            $now = now();

            $rows = [
                ['slug' => 'pro-1-month', 'name' => 'Pro · 1 month', 'badge' => null, 'price_usd' => 20, 'duration_count' => 1, 'sort' => 10],
                ['slug' => 'pro-3-months', 'name' => 'Pro · 3 months', 'badge' => null, 'price_usd' => 52, 'duration_count' => 3, 'sort' => 20],
                ['slug' => 'pro-6-months', 'name' => 'Pro · 6 months', 'badge' => null, 'price_usd' => 96, 'duration_count' => 6, 'sort' => 30],
                ['slug' => 'pro-12-months', 'name' => 'Pro · 12 months', 'badge' => 'Best value', 'price_usd' => 160, 'duration_count' => 12, 'sort' => 40],
            ];

            DB::table('products')->insert(array_map(fn (array $row) => $row + [
                'grant_type' => 'plan_term',
                'plan_id' => $pro,
                'duration_unit' => 'month',
                'active' => true,
                'visible' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ], $rows));
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('discount_product');
        Schema::dropIfExists('discounts');
        Schema::dropIfExists('products');
    }
};
