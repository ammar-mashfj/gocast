@extends('admin.layout')

@section('title', 'Preview email')

@section('content')
    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-4">
                    <div>
                        <h2 class="card-title text-base">What they will get</h2>
                        <p class="text-sm opacity-70">
                            The finished email, rendered by the same template that will send it.
                        </p>
                    </div>

                    <div class="rounded-box border border-base-300 bg-base-200 p-3">
                        <div class="px-1 pb-2 text-xs opacity-60">
                            <span class="opacity-70">Subject</span> <span class="font-medium">{{ $draft->subject }}</span>
                        </div>
                        <div class="px-1 pb-3 text-xs opacity-60">
                            <span class="opacity-70">Preview line</span> {{ $draft->preheader }}
                        </div>
                        {{-- SANDBOXED AND srcdoc, NOT AN src. The markup is
                             rendered inline so no route has to serve it, and
                             the sandbox has no allow-* flags at all: the
                             preview's unsubscribe link is a real signed one for
                             the first recipient, and a frame that could
                             navigate on its own — or that a stray script in the
                             body could drive — would be able to use it. Nothing
                             in an email needs to run anyway. --}}
                        <iframe srcdoc="{{ $html }}" sandbox referrerpolicy="no-referrer"
                                title="Email preview"
                                class="h-[36rem] w-full rounded border border-base-300 bg-white"></iframe>
                    </div>

                    <details class="rounded-box border border-base-300 p-3">
                        <summary class="cursor-pointer text-sm font-medium">Plain-text version</summary>
                        {{-- Worth a look rather than worth hiding: it is what a
                             plain-text client and a screen reader get, and it
                             is where a paragraph break that did not land is
                             most obvious. --}}
                        <pre class="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-base-200 p-3 text-xs">{{ $text }}</pre>
                    </details>
                </div>
            </div>
        </section>

        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST" action="{{ route('admin.emails.store') }}" class="card-body gap-4">
                    @csrf

                    {{-- The previewed draft, carried through verbatim, so the
                         send posts what is on screen rather than a second
                         reading of the form. Re-validated on the way in by the
                         same request class, so a tampered field is rejected
                         rather than trusted. --}}
                    @foreach ($fields as $name => $value)
                        @if (! is_null($value) && $value !== false)
                            <input type="hidden" name="{{ $name }}" value="{{ $value === true ? '1' : $value }}">
                        @endif
                    @endforeach
                    @foreach ($recipients as $recipient)
                        <input type="hidden" name="recipients[]" value="{{ $recipient }}">
                    @endforeach

                    <div>
                        <h2 class="card-title text-base">
                            Going to {{ count($willSend) }} {{ Str::plural('address', count($willSend)) }}
                        </h2>
                        <p class="text-sm opacity-70">One message each — nobody sees the others.</p>
                    </div>

                    <ul class="flex max-h-64 flex-col gap-1 overflow-y-auto font-mono text-xs">
                        @foreach ($willSend as $recipient)
                            <li class="truncate">{{ $recipient }}</li>
                        @endforeach
                    </ul>

                    @if ($suppressed)
                        {{-- Shown before the button, not reported afterwards:
                             an admin who meant to reach these people needs to
                             know now, while untick-ing "outreach" is still an
                             option. --}}
                        <div role="alert" class="alert alert-warning alert-soft">
                            <span>
                                <strong>{{ count($suppressed) }}</strong>
                                {{ Str::plural('address', count($suppressed)) }} will be skipped —
                                {{ count($suppressed) === 1 ? 'it has' : 'they have' }} unsubscribed:
                                <span class="mt-1 block font-mono text-xs">{{ implode(', ', $suppressed) }}</span>
                            </span>
                        </div>
                    @endif

                    <div class="text-sm">
                        @if ($draft->marketing)
                            <span class="badge badge-ghost badge-sm">Outreach</span>
                            <p class="mt-2 opacity-70">Carries an unsubscribe link and the one-click header.</p>
                        @else
                            <span class="badge badge-ghost badge-sm">Operational</span>
                            <p class="mt-2 opacity-70">
                                No unsubscribe link, and the unsubscribe list is not consulted. Right for a reply or a
                                note about someone's own account, wrong for anything promotional.
                            </p>
                        @endif
                    </div>

                    <div class="border-t border-base-300 pt-4">
                        @if ($willSend)
                            <button type="submit" class="btn btn-primary">Send it</button>
                            <p class="mt-2 text-sm opacity-60">There is no unsend.</p>
                        @else
                            <p class="text-sm opacity-70">Every address on the list has unsubscribed, so there is nothing to send.</p>
                        @endif
                        <a href="{{ route('admin.emails.index') }}" class="btn btn-ghost btn-sm mt-3">Back to the form</a>
                    </div>
                </form>
            </div>
        </section>
    </div>
@endsection
