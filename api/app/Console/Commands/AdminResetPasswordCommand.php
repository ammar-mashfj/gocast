<?php

namespace App\Console\Commands;

use App\Models\Admin;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * The only password-reset path for an admin account. There is no
 * forgot-password flow in the panel by design, so a locked-out operator
 * runs this on the server instead of editing the database by hand.
 */
class AdminResetPasswordCommand extends Command
{
    protected $signature = 'admin:reset-password
        {email : The admin email address}
        {--password= : The new password (min 12 chars); prompted when omitted}';

    protected $description = 'Reset the password of an existing admin account';

    public function handle(): int
    {
        $email = $this->argument('email');

        $admin = Admin::query()->where('email', $email)->first();

        if ($admin === null) {
            $this->error("No admin found with email {$email}.");

            return self::FAILURE;
        }

        $password = $this->option('password') ?: $this->secret('New password (min 12 chars)');

        $validator = Validator::make(['password' => $password], [
            'password' => ['required', 'string', Password::min(12)],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        // Hashing is handled by the model's `password` => 'hashed' cast.
        // Rotating remember_token invalidates any "remember me" cookies
        // issued under the old password.
        $admin->forceFill([
            'password' => $password,
            'remember_token' => null,
        ])->save();

        $this->info("Password for admin {$email} reset.");

        return self::SUCCESS;
    }
}
