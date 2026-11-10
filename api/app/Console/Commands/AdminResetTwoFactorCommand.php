<?php

namespace App\Console\Commands;

use App\Models\Admin;
use Illuminate\Console\Command;

/**
 * Turns off two-factor sign-in for one admin — the recovery path for a lost
 * or replaced phone, run on the server like admin:reset-password. The admin
 * is asked to set it up again at their next sign-in.
 */
class AdminResetTwoFactorCommand extends Command
{
    protected $signature = 'admin:reset-two-factor
        {email : The admin email address}';

    protected $description = 'Turn off two-factor sign-in for an admin so they can set it up again';

    public function handle(): int
    {
        $email = $this->argument('email');

        $admin = Admin::query()->where('email', $email)->first();

        if ($admin === null) {
            $this->error("No admin found with email {$email}.");

            return self::FAILURE;
        }

        // remember_token too: a "remember me" cookie from before the reset
        // must not skip the new setup.
        $admin->forceFill([
            'two_factor_secret' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_last_step' => null,
            'remember_token' => null,
        ])->save();

        $this->info("Two-factor sign-in for admin {$email} turned off. They will set it up again at their next sign-in.");

        return self::SUCCESS;
    }
}
