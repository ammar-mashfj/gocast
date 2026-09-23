@extends('admin.layout')

@section('title', 'Preview upgrade')

@section('content')
    <div class="grid gap-6 lg:grid-cols-3">
        <section class="flex flex-col gap-6 lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-4">
                    <div>
                        <h2 class="card-title text-base">The email {{ $user->email }} will get</h2>
                        <p class="text-sm opacity-70">
                            Rendered by the notification that will send it, from the values on the right.
                        </p>
                    </div>

                    <div class="rounded-box border border-base-300 bg-base-200 p-3">
                        <div class="px-1 pb-3 text-xs opacity-60">
                            <span class="opacity-70">Subject</span> <span class="font-medium">{{ $subject }}</span>
                        </div>
                        {{-- Sandboxed srcdoc with no allow-* flags, same as the
                             one-off email preview: nothing in an email needs to
                             run, and the frame must not be able to navigate.
                             $emailHtml is a plain string, not an HtmlString, so
                             it is escaped and cannot end the attribute early. --}}
                        <iframe srcdoc="{{ $emailHtml }}" sandbox referrerpolicy="no-referrer"
                                title="Email preview"
                                class="h-[40rem] w-full rounded border border-base-300 bg-white"></iframe>
                    </div>
                </div>
            </div>

            {{-- The bell carries the note too, so it is read back here as well
                 rather than being the half nobody checked. --}}
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">In their notification bell</h2>
                    <div class="rounded-box border border-base-300 p-4">
                        <div class="font-medium">{{ data_get($bell, 'title') }}</div>
                        <div class="mt-1 text-sm opacity-80">{{ data_get($bell, 'body') }}</div>
                        @if ($points = data_get($bell, 'action.detail.points'))
                            <div class="mt-3 text-xs font-semibold uppercase opacity-60">{{ data_get($bell, 'action.detail.heading') }}</div>
                            <ul class="mt-1 list-disc space-y-1 pl-5 text-sm">
                                @foreach ($points as $point)
                                    <li>{{ $point }}</li>
                                @endforeach
                            </ul>
                        @endif
                    </div>
                </div>
            </div>
        </section>

        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm lg:sticky lg:top-4">
                {{-- One form, two buttons. "Update preview" posts back here;
                     "Upgrade and email" posts to the send. Editing any field
                     disables the send until the preview is updated, so the
                     button can only ever send what is on screen. --}}
                <form method="POST" action="{{ route('admin.stations.upgrade', $station) }}" class="card-body gap-4"
                      oninput="document.getElementById('send').disabled = true; document.getElementById('stale').hidden = false"
                      onsubmit="event.submitter && event.submitter.id === 'send' && (event.submitter.disabled = true)">
                    @csrf

                    <div class="text-sm">
                        <div class="font-medium">{{ $user->email }}</div>
                        <div class="opacity-70">Owner of {{ $station->name }}</div>
                    </div>

                    <div class="rounded-box bg-base-200 p-3 text-sm">
                        <div>
                            <span class="opacity-60">Now</span>
                            {{ $user->plan?->name ?? 'no plan' }}{{ $user->plan_expires_at ? ', until '.$user->plan_expires_at->toFormattedDateString() : '' }}
                        </div>
                        <div class="mt-1">
                            <span class="opacity-60">After</span>
                            <strong>{{ $plan->name }}, {{ $endsAt ? 'until '.$endsAt->toFormattedDateString() : 'no end date' }}</strong>
                        </div>
                    </div>

                    @if ($endsAt && $user->plan && ! $user->plan->isFree() && $user->plan_expires_at === null)
                        <div role="alert" class="alert alert-warning alert-soft text-sm">
                            They have {{ $user->plan->name }} with no end date today. This puts an end date on it, and they go back to Free on {{ $endsAt->toFormattedDateString() }}.
                        </div>
                    @endif

                    <div class="flex gap-3">
                        <label class="block w-1/2">
                            <span class="mb-1 block text-sm">Plan</span>
                            <select name="plan_id" class="select select-sm w-full">
                                @foreach ($upgradePlans as $option)
                                    <option value="{{ $option->id }}" @selected($option->id === $plan->id)>{{ $option->name }}</option>
                                @endforeach
                            </select>
                        </label>
                        <label class="block w-1/2">
                            <span class="mb-1 block text-sm">For</span>
                            <select name="term" class="select select-sm w-full">
                                @foreach ($terms as $value => $label)
                                    <option value="{{ $value }}" @selected($value === $termKey)>{{ $label }}</option>
                                @endforeach
                            </select>
                        </label>
                    </div>

                    <label class="block">
                        <span class="mb-1 block text-sm">Note</span>
                        <textarea name="note" rows="8" required maxlength="2000" class="textarea w-full text-sm">{{ $note }}</textarea>
                    </label>

                    <p id="stale" class="text-sm text-warning" hidden>Changed — update the preview before sending.</p>

                    <div class="flex flex-wrap items-center gap-2 border-t border-base-300 pt-4">
                        <button type="submit" id="send" class="btn btn-primary">Upgrade and email</button>
                        <button type="submit" formaction="{{ route('admin.stations.upgrade.preview', $station) }}"
                                class="btn btn-outline btn-sm">Update preview</button>
                    </div>
                    <p class="text-sm opacity-60">There is no unsend. Nothing has been changed or sent yet.</p>

                    <a href="{{ route('admin.stations.index', ['search' => $station->slug]) }}" class="btn btn-ghost btn-sm self-start">Cancel</a>
                </form>
            </div>
        </section>
    </div>
@endsection
