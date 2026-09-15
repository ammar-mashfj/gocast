@extends('admin.layout')

@section('title', 'Send email')

@section('content')
    {{-- Stated before the form rather than next to the button, because it is
         what should make somebody read the copy once more before they start
         typing, not a warning they meet once they have finished. --}}
    <div role="alert" class="alert alert-warning alert-soft mb-6">
        <span>
            This sends <strong>real email from gocast.fm</strong> to the addresses you list, one message each —
            nobody sees who else got it. There is no unsend, so you get a preview of the finished email first.
        </span>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST" action="{{ route('admin.emails.preview') }}" class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">New email</h2>
                        <p class="text-sm opacity-70">
                            A one-off message in the GoCast template — a reply to somebody who wrote in, a note to a
                            handful of people. Anything the whole platform should see belongs in
                            <a href="{{ route('admin.announcements.index') }}" class="link">Announcements</a> instead.
                        </p>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">To</legend>
                        <textarea name="recipients" rows="3" autofocus required
                                  placeholder="rae@example.com, dj@example.com"
                                  class="textarea w-full font-mono @error('recipients') textarea-error @enderror @error('recipients.*') textarea-error @enderror">{{ old('recipients') }}</textarea>
                        <p class="label">
                            Commas, spaces or one per line. Up to {{ $maxRecipients }}. Each address gets its own
                            message, so none of them can see the others.
                        </p>
                        @error('recipients')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                        @error('recipients.*')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Subject</legend>
                        <input type="text" name="subject" value="{{ old('subject') }}" required maxlength="150"
                               placeholder="About your station"
                               class="input w-full @error('subject') input-error @enderror">
                        <p class="label">The only part guaranteed to be read, and the one thing not repeated in the email.</p>
                        @error('subject')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Greeting</legend>
                            <input type="text" name="greeting" value="{{ old('greeting') }}" maxlength="120"
                                   placeholder="Hi Rae,"
                                   class="input w-full @error('greeting') input-error @enderror">
                            {{-- Said plainly because the form takes a list of
                                 addresses: there is no merge field here, and an
                                 admin who assumes there is sends "Hi Rae," to
                                 twelve people. --}}
                            <p class="label">Typed once and sent to everyone as written — no names are filled in. Leave blank for no greeting.</p>
                            @error('greeting')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>

                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Sign-off</legend>
                            <input type="text" name="sign_off" value="{{ old('sign_off') }}" maxlength="120"
                                   placeholder="{{ $defaultSignOff }}"
                                   class="input w-full @error('sign_off') input-error @enderror">
                            <p class="label">Blank uses “{{ $defaultSignOff }}”.</p>
                            @error('sign_off')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Headline</legend>
                        <input type="text" name="headline" value="{{ old('headline') }}" maxlength="200"
                               placeholder="Your station is back on air"
                               class="input w-full @error('headline') input-error @enderror">
                        <p class="label">Optional. The big bold line above the body — leave it out for anything that reads like a personal note.</p>
                        @error('headline')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Body</legend>
                        <textarea name="body" rows="10" required maxlength="20000"
                                  placeholder="Thanks for writing in — we found what was going on with your stream.&#10;&#10;The container had run out of memory overnight, which is why it went quiet without an error. It is back up and we have raised the limit."
                                  class="textarea w-full @error('body') textarea-error @enderror">{{ old('body') }}</textarea>
                        {{-- The one rule an admin has to know about this field,
                             and the one that is invisible until the preview:
                             a single newline does nothing. --}}
                        <p class="label">
                            Plain writing — <strong>leave a blank line between paragraphs</strong>. Formatting and HTML
                            are shown as the characters you typed, not rendered.
                        </p>
                        @error('body')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Button link</legend>
                            <input type="text" name="cta_url" value="{{ old('cta_url') }}" maxlength="2048"
                                   placeholder="https://gocast.fm/dashboard"
                                   class="input w-full font-mono @error('cta_url') input-error @enderror">
                            {{-- Absolute, unlike an announcement's path: this
                                 lands in a mail client, which has no origin to
                                 resolve a path against. --}}
                            <p class="label">Optional. A full <code>https://</code> address — a mail client cannot resolve a path.</p>
                            @error('cta_url')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>

                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Button text</legend>
                            <input type="text" name="cta_label" value="{{ old('cta_label') }}" maxlength="40"
                                   placeholder="Open your dashboard"
                                   class="input w-full @error('cta_label') input-error @enderror">
                            <p class="label">Needed only if there is a link. Both or neither.</p>
                            @error('cta_label')
                                <p class="label text-error">{{ $message }}</p>
                            @enderror
                        </fieldset>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Preview line</legend>
                        <input type="text" name="preheader" value="{{ old('preheader') }}" maxlength="150"
                               placeholder="Built from your opening sentence if blank"
                               class="input w-full @error('preheader') input-error @enderror">
                        <p class="label">The grey line beside the subject in an inbox list.</p>
                        @error('preheader')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset rounded-box border border-base-300 p-4">
                        <label class="flex cursor-pointer items-start gap-3">
                            <input type="checkbox" name="marketing" value="1" @checked(old('marketing'))
                                   class="checkbox checkbox-sm mt-0.5">
                            <span>
                                <span class="font-medium">This is outreach, not a reply</span>
                                {{-- The three effects are listed together
                                     because they are one question, and an admin
                                     who thinks the box only adds a footer link
                                     will tick it on a support reply and wonder
                                     later why it never arrived. --}}
                                <span class="block text-sm opacity-70">
                                    Adds an unsubscribe link and the one-click header, and
                                    <strong>skips anyone who has already unsubscribed</strong>. Tick it for anything
                                    promotional. Leave it clear for a reply, or a note about someone's own account —
                                    those go out even to addresses on the unsubscribe list.
                                </span>
                            </span>
                        </label>
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
                        <p class="text-sm opacity-70">The last {{ $sent->count() ?: 'few' }} from this page.</p>
                    </div>

                    <ul class="flex flex-col gap-3">
                        @forelse ($sent as $email)
                            <li class="border-b border-base-300 pb-3 last:border-0 last:pb-0">
                                <div class="text-sm font-medium">{{ $email['subject'] }}</div>
                                <div class="mt-1 text-xs opacity-60">
                                    @if (count($email['recipients']) === 1)
                                        {{ $email['recipients'][0] }}
                                    @else
                                        {{-- The addresses are the point of the
                                             list — "did this reach them?" is
                                             the only question asked of it — so
                                             they are here rather than a count,
                                             folded away once there are enough
                                             to crowd the column. --}}
                                        <details>
                                            <summary class="cursor-pointer">{{ count($email['recipients']) }} recipients</summary>
                                            <div class="mt-1 flex flex-col gap-0.5 font-mono">
                                                @foreach ($email['recipients'] as $address)
                                                    <span>{{ $address }}</span>
                                                @endforeach
                                            </div>
                                        </details>
                                    @endif
                                </div>
                                <div class="mt-1 text-xs opacity-60">
                                    <span title="{{ $email['at']?->toDayDateTimeString() }}">{{ $email['at']?->diffForHumans() }}</span>
                                    @if ($email['by']) · {{ $email['by'] }} @endif
                                    @if ($email['marketing']) · <span class="badge badge-ghost badge-xs">outreach</span> @endif
                                    @if ($email['suppressed'] > 0) · {{ $email['suppressed'] }} skipped @endif
                                </div>
                            </li>
                        @empty
                            <li class="text-sm opacity-60">Nothing has been sent from here yet.</li>
                        @endforelse
                    </ul>

                    {{-- Said here because this list is where somebody looks for
                         the text of an email they sent, and it is not kept. --}}
                    <p class="text-xs opacity-50">
                        Only who and when is recorded, never the message itself — if you need a copy of what went out,
                        send yourself one too.
                    </p>
                </div>
            </div>
        </section>
    </div>
@endsection
