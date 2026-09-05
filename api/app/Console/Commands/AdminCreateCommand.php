<?php

namespace App\Console\Commands;

use App\Models\Admin;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * The only way an admin account comes into existence — there is no signup
 * and no invite flow. A lost password is recovered with
 * `php artisan admin:reset-password`, not by creating a second account.
 */
class AdminCreateCommand extends Command
{
    protected $signature = 'admin:create
        {email : The admin email address}
        {--name= : The admin display name}
        {--password= : The admin password (min 12 chars)}';

    protected $description = 'Create an admin account for the admin panel';

    public function handle(): int
    {
        $data = [
            'email' => $this->argument('email'),
            'name' => $this->option('name') ?: $this->ask('Name'),
            'password' => $this->option('password') ?: $this->secret('Password (min 12 chars)'),
        ];

        $validator = Validator::make($data, [
            'email' => ['required', 'email', 'unique:admins,email'],
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', Password::min(12)],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        // Hashing is handled by the model's `password` => 'hashed' cast.
        Admin::create($data);

        $this->info("Admin {$data['email']} created.");

        return self::SUCCESS;
    }
}
