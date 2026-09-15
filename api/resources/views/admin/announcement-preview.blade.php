@extends('admin.layout')

@section('title', 'Send announcement?')

@php
    $action = $payload['action'];
    $detail = $action['detail'] ?? null;

    // Mirrors the client's level => colour map. Duplicated rather than shared
    // because there is nothing to share it through — the dashboard is a
    // separate app in a separate language — and because being approximately
    // right here is enough: this is a preview of tone, not a screenshot.
    $levelClass = [
        'info' => 'text-base-content/60',
        'success' => 'text-success',
        'warning' => 'text-warning',
        'error' => 'text-error',
    ][$payload['level']] ?? 'text-base-content/60';
@endphp

@section('content')
    <div class="mx-auto max-w-2xl">
        <h1 class="text-xl font-bold">Ready to send</h1>
        <p class="mt-1 text-sm opacity-70">
            This is what lands in the bell. Read it once more — after the button below there is no undo.
        </p>

        <div class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
            <div class="card-body gap-4">
                <div class="text-xs font-medium tracking-wide uppercase opacity-50">The row they see</div>

                {{-- Approximates the dropdown: an unread row is tinted, the
                     glyph carries the level's colour, and the body is clamped
                     to two lines exactly as the client clamps it. The clamp is
                     the part worth previewing — it is where a summary written
                     at this width quietly loses its second half. --}}
                <div class="flex gap-3 rounded-lg bg-base-200/60 p-3">
                    <span class="{{ $levelClass }} mt-0.5 shrink-0 font-mono text-xs">●</span>
                    <div class="min-w-0">
                        <div class="text-sm font-medium">{{ $payload['title'] }}</div>
                        @if ($payload['body'])
                            <div class="mt-0.5 line-clamp-2 text-sm opacity-70">{{ $payload['body'] }}</div>
                        @endif
                    </div>
                </div>

                @if ($detail)
                    <div class="text-xs font-medium tracking-wide uppercase opacity-50">
                        What opens when they click it
                    </div>

                    <div class="rounded-lg border border-base-300 p-4">
                        <div class="text-sm font-medium">{{ $payload['title'] }}</div>
                        @if ($payload['body'])
                            <div class="mt-1 text-sm opacity-70">{{ $payload['body'] }}</div>
                        @endif

                        <div class="mt-3 rounded-lg bg-base-200/60 p-3">
                            @if ($detail['heading'])
                                <div class="text-xs font-medium tracking-wide uppercase opacity-60">
                                    {{ $detail['heading'] }}
                                </div>
                            @endif
                            <ul class="mt-2 flex flex-col gap-2">
                                @foreach ($detail['points'] as $point)
                                    <li class="flex gap-2 text-sm">
                                        <span class="text-success">✓</span>
                                        <span>{{ $point }}</span>
                                    </li>
                                @endforeach
                            </ul>
                        </div>

                        <div class="mt-3 text-right">
                            <span class="btn btn-primary btn-sm">{{ $action['label'] }}</span>
                        </div>
                    </div>
                @else
                    <div class="text-xs opacity-60">
                        No points, so clicking the row goes straight to the link — no dialog.
                    </div>
                @endif

                <div class="border-t border-base-300 pt-3 font-mono text-xs opacity-60">
                    {{ $action['url'] }}<br>
                    key: {{ $key }} · level: {{ $payload['level'] }} · icon: {{ $payload['icon'] }}
                </div>
            </div>
        </div>

        @if ($skipped > 0)
            {{-- Only shown when it is true, and it is worth a full alert when
                 it is: a reused key is the one way this page can look like it
                 worked and reach nobody. --}}
            <div role="alert" class="alert alert-warning alert-soft mt-6">
                <span>
                    {{ number_format($skipped) }} of {{ number_format($audience) }} accounts already have
                    <code>{{ $key }}</code> and will be skipped.
                    @if ($pending === 0)
                        <strong>That is everybody — sending now would reach nobody.</strong>
                        Change the key if this is meant to be a new announcement.
                    @else
                        This is what you want if you are finishing a send that failed halfway.
                    @endif
                </span>
            </div>
        @endif

        {{-- The button is disabled the moment it is used, in a timeout so the
             browser has already collected the form data. The send takes as long
             as the account table does, and a button that still looks clickable
             for all of it is an invitation to click it again — which used to
             mean two fan-outs reading the same "nobody has this yet" snapshot.
             AnnouncementSender's lock is what actually makes that safe; this
             only stops the admin discovering it. --}}
        <form method="POST" action="{{ route('admin.announcements.store') }}" class="mt-6 flex items-center gap-3"
              onsubmit="const b = this.querySelector('button[type=submit]');
                        setTimeout(() => { b.disabled = true; b.textContent = 'Sending…'; });">
            @csrf

            {{-- The previewed announcement, carried whole. Posting the fields
                 again rather than a token for a stored draft: the send has to
                 be the thing on this screen, and a draft looked up by id is
                 one cache away from not being it.

                 `points` goes back as the newline-joined text the form
                 collected, because the request splits it again on the way in —
                 one parsing rule, used by both steps. --}}
            <input type="hidden" name="key" value="{{ $fields['key'] }}">
            <input type="hidden" name="headline" value="{{ $fields['headline'] }}">
            <input type="hidden" name="summary" value="{{ $fields['summary'] ?? '' }}">
            <input type="hidden" name="detail_heading" value="{{ $fields['detail_heading'] ?? '' }}">
            <input type="hidden" name="points" value="{{ implode("\n", $fields['points'] ?? []) }}">
            <input type="hidden" name="url" value="{{ $fields['url'] ?? '' }}">
            <input type="hidden" name="link_label" value="{{ $fields['link_label'] ?? '' }}">
            <input type="hidden" name="level" value="{{ $fields['level'] }}">
            <input type="hidden" name="icon" value="{{ $fields['icon'] ?? '' }}">

            <button type="submit" class="btn btn-primary" @disabled($pending === 0)>
                @if ($pending === 0)
                    Nobody left to send to
                @else
                    Send to {{ number_format($pending) }} {{ Str::plural('account', $pending) }}
                @endif
            </button>

            {{-- history.back() rather than a link to the form, so the copy that
                 was just typed is still in the fields. A fresh GET would hand
                 back an empty form and the announcement would be written
                 twice. --}}
            <button type="button" class="btn btn-ghost" onclick="history.back()">Back to edit</button>
        </form>
    </div>
@endsection
