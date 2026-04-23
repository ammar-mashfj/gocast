<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Anonymous email opt-ins per station — listeners who clicked "notify me when
 * this goes live" while the station was off air. Delivery is queued from the
 * "station went live" event handler (TODO).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('station_notify_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('station_id')->constrained()->cascadeOnDelete();
            $table->string('email');
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->unique(['station_id', 'email']);
            $table->index('email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('station_notify_subscriptions');
    }
};
