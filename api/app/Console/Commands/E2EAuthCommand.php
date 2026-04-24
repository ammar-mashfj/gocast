<?php

namespace App\Console\Commands;

use App\Models\EmailVerificationCode;
use App\Models\PasswordResetCode;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use InvalidArgumentException;

#[Signature('e2e:auth
    {action : user|delete|email-code|password-code}
    {--email= : Target user email}
    {--password=Password123! : Password for created users}
    {--name=E2E User : Name for created users}
    {--unverified : Create the user without email verification}
    {--code=123456 : Deterministic 6-digit code for email/password flows}')]
#[Description('Local-only auth fixtures for browser E2E tests')]
class E2EAuthCommand extends Command
{
    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('e2e:auth is only available in local/testing environments.');

            return self::FAILURE;
        }

        try {
            match ($this->argument('action')) {
                'user' => $this->createUser(),
                'delete' => $this->deleteUser($this->email()),
                'email-code' => $this->setEmailCode($this->email(), $this->code()),
                'password-code' => $this->setPasswordCode($this->email(), $this->code()),
                default => throw new InvalidArgumentException('Unsupported action.'),
            };
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function createUser(): void
    {
        $email = $this->email();

        $this->deleteUser($email);

        $user = User::create([
            'name' => (string) $this->option('name'),
            'email' => $email,
            'password' => Hash::make((string) $this->option('password')),
        ]);

        $user->forceFill([
            'email_verified_at' => $this->option('unverified') ? null : now(),
        ])->save();

        if ($this->option('unverified')) {
            $this->setEmailCode($email, $this->code());
        }

        $this->line("user:{$email}");
    }

    private function deleteUser(string $email): void
    {
        PasswordResetCode::query()->whereKey($email)->delete();

        User::withTrashed()
            ->where('email', $email)
            ->get()
            ->each(function (User $user): void {
                EmailVerificationCode::query()->whereKey($user->id)->delete();
                $user->tokens()->delete();
                $user->forceDelete();
            });
    }

    private function setEmailCode(string $email, string $code): void
    {
        $user = User::query()->where('email', $email)->first();

        if (! $user) {
            throw new InvalidArgumentException("User not found for {$email}.");
        }

        EmailVerificationCode::updateOrCreate(
            ['user_id' => $user->id],
            [
                'code_hash' => Hash::make($code),
                'attempts' => 0,
                'expires_at' => now()->addMinutes(EmailVerificationCode::CODE_TTL_MINUTES),
            ],
        );

        $this->line("email-code:{$email}");
    }

    private function setPasswordCode(string $email, string $code): void
    {
        PasswordResetCode::updateOrCreate(
            ['email' => $email],
            [
                'code_hash' => Hash::make($code),
                'attempts' => 0,
                'expires_at' => now()->addMinutes(PasswordResetCode::CODE_TTL_MINUTES),
            ],
        );

        $this->line("password-code:{$email}");
    }

    private function email(): string
    {
        $email = (string) $this->option('email');

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid --email option is required.');
        }

        return Str::lower($email);
    }

    private function code(): string
    {
        $code = (string) $this->option('code');

        if (! preg_match('/^\d{6}$/', $code)) {
            throw new InvalidArgumentException('--code must be exactly 6 digits.');
        }

        return $code;
    }
}
