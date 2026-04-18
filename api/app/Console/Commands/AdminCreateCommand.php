<?php

namespace App\Console\Commands;

use App\Models\Admin;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AdminCreateCommand extends Command
{
    protected $signature = 'admin:create
        {email : The admin email address}
        {--name= : The admin display name}
        {--password= : The admin password (min 12 chars)}';

    protected $description = 'Create a new admin account. 2FA must be enrolled on first login.';

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
            'password' => ['required', 'string', 'min:12'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        Admin::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        $this->info("Admin {$data['email']} created. They must enrol 2FA on first login.");

        return self::SUCCESS;
    }
}
