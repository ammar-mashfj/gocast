<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * lava.top card checkout, kept apart from the OxaPay `payments` table: a
 * different provider with its own statuses and its own recurring membership.
 *
 * - `lava_payments`: one charge. A pack (3/6/12 months, bought once), the
 *   first membership payment, or a membership renewal lava.top made on its
 *   own. `contract_id` is lava.top's id for the charge, the only thing its
 *   webhooks carry that names it, so it is how a webhook finds the row.
 *   What it grants is copied from the product at checkout, as `payments` does.
 * - `lava_memberships`: one monthly membership. `contract_id` is the first
 *   charge's id, which lava.top calls the parent contract: every renewal
 *   names it, and cancelling needs it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lava_memberships', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('contract_id', 64)->unique();
            $table->string('email');
            // active → cancelled (by the buyer, by us, or by lava.top after
            // the last failed retry).
            $table->string('status', 20)->default('active')->index();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::create('lava_payments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            // Kept when the account or product goes: a financial record.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('discount_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('lava_membership_id')->nullable()->constrained()->nullOnDelete();

            // pack | membership | renewal
            $table->string('kind', 20);
            $table->string('product_name', 80);
            $table->foreignId('plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('duration_unit', 10)->nullable();
            $table->unsignedSmallInteger('duration_count')->nullable();
            $table->decimal('list_price_usd', 10, 2);
            $table->string('discount_code', 60)->nullable();
            $table->decimal('discount_usd', 10, 2)->default(0);
            $table->decimal('amount_usd', 10, 2);
            $table->string('email');
            // card | paypal: which lava.top processor the buyer picked.
            $table->string('method', 10)->default('card');

            $table->string('contract_id', 64)->nullable()->unique();
            $table->text('payment_url')->nullable();
            // new → paid | failed; paid → refunded | chargeback; review = a
            // human has to look (paid but not grantable, amount mismatch).
            $table->string('status', 20)->default('new')->index();
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
    }

    public function down(): void
    {
        Schema::dropIfExists('lava_payments');
        Schema::dropIfExists('lava_memberships');
    }
};
