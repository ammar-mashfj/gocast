@extends('admin.layout')

@section('title', 'Invites')

@section('content')
    @if ($minted)
        {{-- The link just made, above everything, with the one action this page
             exists for. Flashed, so it is gone on the next load — the table
             below still has it. --}}
        <div class="card mb-6 border border-success bg-base-100 shadow-sm">
            <div class="card-body gap-3">
                <div>
                    <h2 class="card-title text-base">Invite link ready</h2>
                    <p class="text-sm opacity-70">
                        <strong>{{ $minted['plan'] }}</strong>{{ $minted['label'] ? ' for '.$minted['label'] : '' }}.
                        Paste this into the email. It applies the plan when they sign up.
                    </p>
                </div>
                <div class="join w-full">
                    <input type="text" readonly value="{{ $minted['url'] }}" id="minted-url"
                           class="input join-item w-full font-mono text-sm">
                    <button type="button" class="btn btn-primary join-item" data-copy="#minted-url">Copy</button>
                </div>
            </div>
        </div>
    @endif

    <div class="stats mb-6 w-full border border-base-300 bg-base-100 shadow-sm max-sm:stats-vertical">
        <div class="stat">
            <div class="stat-title">Open</div>
            <div class="stat-value">{{ $openInvites }}</div>
            <div class="stat-desc">still redeemable</div>
        </div>
        <div class="stat">
            <div class="stat-title">Redeemed</div>
            <div class="stat-value {{ $redeemedInvites > 0 ? 'text-success' : '' }}">{{ $redeemedInvites }}</div>
            <div class="stat-desc">links used at least once</div>
        </div>
        <div class="stat">
            <div class="stat-title">Minted</div>
            <div class="stat-value">{{ $totalInvites }}</div>
        </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST" action="{{ route('admin.invites.store') }}" class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">New invite</h2>
                        <p class="text-sm opacity-70">
                            One link, one person. Sign-ups through it land on the plan below.
                        </p>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Who it's for</legend>
                        <input type="text" name="label" value="{{ old('label') }}" autofocus
                               maxlength="255" placeholder="DJ name, show, or where you're posting it"
                               class="input w-full @error('label') input-error @enderror">
                        <p class="label">Only you see this. It's how you tell later which email converted.</p>
                        @error('label')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Code</legend>
                        <input type="text" name="code" value="{{ old('code') }}"
                               minlength="6" maxlength="40" pattern="[A-Za-z0-9-]+"
                               placeholder="Built from the name above if blank"
                               class="input w-full font-mono @error('code') input-error @enderror">
                        <p class="label">Optional. Blank builds one from the name, so <em>DJ Ammar</em> on Pro becomes <code>DJ-Ammar-GoCast-Pro</code>. Type your own to override, at least 6 characters: a short code can be guessed, and whoever guesses a single-use one takes the seat.</p>
                        @error('code')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Plan</legend>
                        <select name="plan_id" class="select w-full @error('plan_id') select-error @enderror">
                            @foreach ($plans as $plan)
                                <option value="{{ $plan->id }}"
                                        @selected((int) old('plan_id', $defaultPlanId) === $plan->id)>
                                    {{ $plan->name }} — {{ $plan->max_listeners }} listeners, AutoDJ {{ $plan->autodj_enabled ? 'on' : 'off' }}
                                </option>
                            @endforeach
                        </select>
                        @error('plan_id')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Plan lasts (days)</legend>
                        <input type="number" name="duration_days" value="{{ old('duration_days') }}"
                               min="1" max="3650" placeholder="Leave blank for no end date"
                               class="input w-full @error('duration_days') input-error @enderror">
                        <p class="label">After this many days the account drops back to Free automatically and is emailed. Blank keeps the plan until you revoke it by hand.</p>
                        @error('duration_days')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Uses</legend>
                            <input type="number" name="max_uses" value="{{ old('max_uses', 1) }}" required
                                   min="1" max="10000"
                                   class="input w-full @error('max_uses') input-error @enderror">
                            <p class="label">1 for a personal email. More for a shared code in a post.</p>
                            @error('max_uses')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>

                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Link open for (days)</legend>
                            <input type="number" name="link_expires_in_days" value="{{ old('link_expires_in_days') }}"
                                   min="1" max="365" placeholder="No limit"
                                   class="input w-full @error('link_expires_in_days') input-error @enderror">
                            <p class="label">When the link itself stops working. Separate from how long the plan lasts.</p>
                            @error('link_expires_in_days')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>
                    </div>

                    <div class="border-t border-base-300 pt-4">
                        <button type="submit" class="btn btn-primary">Create invite link</button>
                    </div>
                </form>
            </div>
        </section>

        <section class="lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body p-0">
                    <div class="overflow-x-auto">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Label</th>
                                    <th>Link</th>
                                    <th>Grants</th>
                                    <th>Used</th>
                                    <th>Redeemed by</th>
                                    <th>Minted</th>
                                    <th class="text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse ($invites as $invite)
                                    <tr class="hover:bg-base-200 align-top">
                                        <td class="text-sm font-medium">
                                            {{ $invite->label ?: '—' }}
                                        </td>
                                        <td>
                                            <div class="flex items-center gap-1">
                                                <input type="text" readonly value="{{ $invite->url() }}"
                                                       id="invite-url-{{ $invite->id }}"
                                                       class="input input-xs w-56 font-mono">
                                                <button type="button" class="btn btn-ghost btn-xs"
                                                        data-copy="#invite-url-{{ $invite->id }}"
                                                        @disabled(! $invite->isRedeemable())
                                                        title="{{ $invite->isRedeemable() ? 'Copy link' : 'This link no longer redeems' }}">
                                                    Copy
                                                </button>
                                            </div>
                                            <div class="mt-1">
                                                @if ($invite->isExpired())
                                                    <span class="badge badge-outline badge-sm opacity-60">closed</span>
                                                @elseif ($invite->isExhausted())
                                                    <span class="badge badge-success badge-sm">redeemed</span>
                                                @else
                                                    <span class="badge badge-warning badge-sm">open</span>
                                                    @if ($invite->expires_at)
                                                        <span class="text-xs opacity-60" title="{{ $invite->expires_at->toDayDateTimeString() }}">
                                                            until {{ $invite->expires_at->diffForHumans() }}
                                                        </span>
                                                    @endif
                                                @endif
                                            </div>
                                        </td>
                                        <td class="whitespace-nowrap text-sm">
                                            <span class="badge badge-ghost badge-sm">{{ $invite->plan?->name ?? '?' }}</span>
                                            <div class="mt-1 text-xs opacity-60">
                                                {{ $invite->duration_days ? "for {$invite->duration_days} days" : 'no end date' }}
                                            </div>
                                        </td>
                                        <td class="whitespace-nowrap text-sm">
                                            {{ $invite->uses }} / {{ $invite->max_uses }}
                                        </td>
                                        <td class="text-sm">
                                            @forelse ($invite->users as $user)
                                                <div>
                                                    <a href="mailto:{{ $user->email }}" class="link link-hover">{{ $user->name }}</a>
                                                    <span class="text-xs opacity-60">
                                                        &middot; {{ $user->plan?->name ?? 'Free' }}
                                                        @if ($user->plan_expires_at)
                                                            until {{ $user->plan_expires_at->toFormattedDateString() }}
                                                        @endif
                                                        &middot; {{ $user->created_at->diffForHumans() }}
                                                    </span>
                                                </div>
                                            @empty
                                                <span class="opacity-40">—</span>
                                            @endforelse
                                        </td>
                                        <td class="whitespace-nowrap text-sm opacity-70"
                                            title="{{ $invite->created_at->toDayDateTimeString() }}">
                                            {{ $invite->created_at->diffForHumans() }}
                                            <div class="text-xs opacity-60">by {{ $invite->creator?->name ?? 'a removed admin' }}</div>
                                        </td>
                                        <td class="text-right">
                                            @if ($invite->isRedeemable())
                                                <form method="POST" action="{{ route('admin.invites.revoke', $invite) }}"
                                                      onsubmit="return confirm('Close this invite link? It stops redeeming immediately. Anyone who already used it keeps their plan.')">
                                                    @csrf
                                                    <button type="submit" class="btn btn-ghost btn-xs">Close</button>
                                                </form>
                                            @endif
                                        </td>
                                    </tr>
                                @empty
                                    <tr>
                                        <td colspan="7" class="py-10 text-center opacity-60">No invites yet. Make one on the left.</td>
                                    </tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            @if ($invites->hasPages())
                <div class="mt-4">{{ $invites->links() }}</div>
            @endif
        </section>
    </div>

    {{-- Copy buttons. The clipboard API needs a secure context, which the admin
         panel always has in production; the fallback selects the text so a
         manual Ctrl+C still works on plain HTTP in development. --}}
    <script>
        document.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-copy]');
            if (!button) return;

            const input = document.querySelector(button.dataset.copy);
            if (!input) return;

            input.select();

            try {
                await navigator.clipboard.writeText(input.value);
                const original = button.textContent;
                button.textContent = 'Copied';
                setTimeout(() => { button.textContent = original; }, 1500);
            } catch {
                // Text is selected; the admin can copy it by hand.
            }
        });
    </script>
@endsection
