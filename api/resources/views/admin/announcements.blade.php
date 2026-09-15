@extends('admin.layout')

@section('title', 'Announcements')

@section('content')
    {{-- Stated before the form rather than next to the button, because it is
         what should make somebody read the copy once more before they start
         typing, not a warning they meet once they have finished. --}}
    <div role="alert" class="alert alert-warning alert-soft mb-6">
        <span>
            This writes into the notification bell of <strong>every account</strong> —
            <strong>{{ number_format($accounts) }} {{ Str::plural('person', $accounts) }}</strong> right now.
            There is no way to take one back, so you get a preview before anything is sent.
        </span>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST" action="{{ route('admin.announcements.preview') }}" class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">New announcement</h2>
                        <p class="text-sm opacity-70">
                            A product update, a maintenance window — anything GoCast says about itself rather than
                            about one station.
                        </p>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Headline</legend>
                        <input type="text" name="headline" value="{{ old('headline') }}" autofocus required
                               maxlength="120" placeholder="Embeddable players are here"
                               class="input w-full @error('headline') input-error @enderror">
                        <p class="label">One line, sentence case, no full stop. It is the only part guaranteed to be read.</p>
                        @error('headline')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Summary</legend>
                        <textarea name="summary" rows="2" maxlength="300"
                                  placeholder="Put your station on any page with a snippet you copy from settings."
                                  class="textarea w-full @error('summary') textarea-error @enderror">{{ old('summary') }}</textarea>
                        <p class="label">A sentence or two. The dropdown clamps this to two lines, so lead with what matters.</p>
                        @error('summary')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Points — one per line</legend>
                        <textarea name="points" rows="5"
                                  placeholder="Copy the snippet from your station settings.&#10;It keeps playing when someone scrolls away.&#10;Works on any site that allows an iframe."
                                  class="textarea w-full @error('points') textarea-error @enderror @error('points.*') textarea-error @enderror">{{ old('points') }}</textarea>
                        {{-- The one field whose presence changes the shape of
                             the notification rather than its content, so the
                             help text says so outright. --}}
                        <p class="label">
                            Plain sentences, no formatting. Leave this empty and the notification is a single row that
                            links straight out; fill it in and clicking opens a dialog with these inside.
                        </p>
                        @error('points')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                        @error('points.*')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Heading above the points</legend>
                        <input type="text" name="detail_heading" value="{{ old('detail_heading') }}" maxlength="60"
                               placeholder="What's new"
                               class="input w-full @error('detail_heading') input-error @enderror">
                        <p class="label">Optional. Blank uses “What's new”. Ignored when there are no points.</p>
                        @error('detail_heading')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Button goes to</legend>
                            <input type="text" name="url" value="{{ old('url') }}"
                                   placeholder="/dashboard/station/settings"
                                   class="input w-full font-mono @error('url') input-error @enderror">
                            {{-- A path is the recommended form, not merely an
                                 accepted one: these rows are never migrated, so
                                 an absolute URL typed here carries whichever
                                 origin the admin was looking at into everyone's
                                 bell permanently.

                                 The slug-free station links matter even more.
                                 One announcement goes to everybody, so a URL
                                 with somebody's slug in it is wrong for all but
                                 one person — see the /dashboard/station route
                                 in the client, which resolves the slug when the
                                 link is clicked. --}}
                            <p class="label">
                                A path, not a pasted address — it resolves to the right host everywhere.
                                Blank sends them to the dashboard.
                            </p>
                            <ul class="label flex flex-col gap-0.5">
                                <li><code>/dashboard/station/settings</code> — their own station's settings</li>
                                <li><code>/dashboard/station/library</code> — AutoDJ and jingles</li>
                                <li><code>/dashboard/station/audience</code> — listener stats</li>
                                <li><code>/dashboard/settings</code> — their account</li>
                            </ul>
                            <p class="label">
                                Never paste a URL with a station slug in it: it would be wrong for everybody but
                                one person. A full <code>https://</code> address is right only for links off
                                GoCast, and opens in a new tab.
                            </p>
                            @error('url')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>

                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Button text</legend>
                            <input type="text" name="link_label" value="{{ old('link_label') }}" maxlength="40"
                                   placeholder="Take a look"
                                   class="input w-full @error('link_label') input-error @enderror">
                            @error('link_label')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>
                    </div>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Tone</legend>
                            <select name="level" class="select w-full @error('level') select-error @enderror">
                                @foreach ($levels as $level)
                                    <option value="{{ $level }}" @selected(old('level', 'info') === $level)>
                                        {{ ucfirst($level) }}
                                    </option>
                                @endforeach
                            </select>
                            {{-- Colour and nothing else, which is worth saying:
                                 an admin reaching for `error` to make people
                                 read it gets a red icon, not a louder bell. --}}
                            <p class="label">Colours the icon. <strong>Warning</strong> for a maintenance window or a feature going away.</p>
                            @error('level')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>

                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Icon</legend>
                            <input type="text" name="icon" value="{{ old('icon') }}" maxlength="40"
                                   placeholder="megaphone"
                                   class="input w-full font-mono @error('icon') input-error @enderror">
                            <p class="label">Blank uses the megaphone. An icon the dashboard does not know wears a bell — it never leaves a hole.</p>
                            @error('icon')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Key</legend>
                        <input type="text" name="key" value="{{ old('key') }}" maxlength="64"
                               placeholder="Built from the month and the headline if blank"
                               class="input w-full font-mono @error('key') input-error @enderror">
                        {{-- The only field on this page whose purpose is not
                             visible to the recipient, so it gets the longest
                             explanation: everything about resending depends on
                             it. --}}
                        <p class="label">
                            How this announcement is recognised later. Nobody sees it. Reuse a key and only accounts
                            that missed it the first time get it — which is how you finish a send that went wrong, and
                            also how an announcement silently reaches nobody if you reuse one by accident.
                            Only as far back as the {{ config('notifications.retention_days') }}-day retention window,
                            though: past that there are no rows left to recognise it by.
                        </p>
                        @error('key')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <div class="border-t border-base-300 pt-4">
                        <button type="submit" class="btn btn-primary">Preview it</button>
                        <span class="ml-2 text-sm opacity-60">Nothing is sent yet.</span>
                    </div>
                </form>
            </div>
        </section>

        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-4">
                    <div>
                        <h2 class="card-title text-base">Already sent</h2>
                        <p class="text-sm opacity-70">Check here before writing — a key used twice reaches nobody.</p>
                    </div>

                    <ul class="flex flex-col gap-3">
                        @forelse ($sent as $announcement)
                            <li class="border-b border-base-300 pb-3 last:border-0 last:pb-0">
                                <div class="text-sm font-medium">{{ $announcement['title'] }}</div>
                                <div class="mt-1 font-mono text-xs opacity-60">{{ $announcement['key'] ?? '—' }}</div>
                                <div class="mt-1 text-xs opacity-60">
                                    {{ number_format($announcement['recipients']) }}
                                    {{ Str::plural('account', $announcement['recipients']) }} ·
                                    <span title="{{ $announcement['last_sent']->toDayDateTimeString() }}">
                                        {{ $announcement['last_sent']->diffForHumans() }}
                                    </span>
                                </div>
                            </li>
                        @empty
                            <li class="text-sm opacity-60">Nothing has been announced yet.</li>
                        @endforelse
                    </ul>

                    {{-- Said here because this list is where somebody notices
                         an old announcement has vanished and assumes something
                         is broken. --}}
                    <p class="text-xs opacity-50">
                        Notifications are deleted after
                        {{ config('notifications.retention_days') }} days, so older announcements drop off this list
                        and out of everyone's bell. A key stops being spent at the same moment: reuse one older than
                        that and the announcement goes to everybody again.
                    </p>
                </div>
            </div>
        </section>
    </div>
@endsection
