@extends('admin.layout')

@section('title', 'Spotlights')

@section('content')
    @php($form = $editing)
    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST" enctype="multipart/form-data"
                      action="{{ $form ? route('admin.spotlights.update', $form) : route('admin.spotlights.store') }}"
                      class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">{{ $form ? 'Edit spotlight' : 'New spotlight' }}</h2>
                        <p class="text-sm opacity-70">
                            Opens as a dialog the next time a matching account loads the dashboard (never over the studio or a live show).
                            Closing it leaves a chip in the top bar that reopens it.
                            Switching it off or passing the end date takes it out of every dashboard.
                        </p>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Kind</legend>
                            <select name="kind" class="select w-full">
                                @foreach ($kinds as $kind)
                                    <option value="{{ $kind }}" @selected(old('kind', $form?->kind ?? 'feature') === $kind)>{{ ucfirst($kind) }}</option>
                                @endforeach
                            </select>
                            <p class="label">Only changes the label on top.</p>
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Who sees it</legend>
                            <select name="audience" class="select w-full">
                                @foreach ($audiences as $audience)
                                    <option value="{{ $audience }}" @selected(old('audience', $form?->audience ?? 'all') === $audience)>
                                        {{ ['all' => 'Everyone', 'free' => 'Free accounts', 'pro' => 'Paid accounts'][$audience] }}
                                    </option>
                                @endforeach
                            </select>
                            <p class="label">Checked on every load.</p>
                        </fieldset>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Title</legend>
                        <input type="text" name="title" value="{{ old('title', $form?->title) }}" required maxlength="120"
                               placeholder="Black Friday: Pro for 40% less" class="input w-full @error('title') input-error @enderror">
                        @error('title')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Chip text</legend>
                        <input type="text" name="chip_label" value="{{ old('chip_label', $form?->chip_label) }}" maxlength="32"
                               placeholder="Black Friday: $99" class="input w-full @error('chip_label') input-error @enderror">
                        <p class="label">What the top-bar chip says once the dialog is closed. Blank = the title. Phones show only the icon.</p>
                        @error('chip_label')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Body</legend>
                        <textarea name="body" rows="5" maxlength="2000"
                                  class="textarea w-full @error('body') textarea-error @enderror"
                                  placeholder="Markdown: **bold**, lists, [links](/dashboard).">{{ old('body', $form?->body) }}</textarea>
                        <p class="label">Markdown. Raw HTML is stripped. Payment copy: say "USDT, USDC or another digital currency", never "crypto".</p>
                        @error('body')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Image (optional)</legend>
                        @if ($form?->image_path)
                            <img src="{{ $form->imageUrl() }}" alt="" class="mb-2 aspect-[2/1] w-full rounded-box object-cover">
                            <label class="label mb-2 cursor-pointer justify-start gap-2">
                                <input type="checkbox" name="remove_image" value="1" class="checkbox checkbox-sm">
                                <span>Remove this image</span>
                            </label>
                        @endif
                        <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"
                               class="file-input w-full @error('image') file-input-error @enderror">
                        <p class="label">JPG, PNG, WebP or GIF, under 2 MB. Shown across the top of the dialog at 2:1 (e.g. 1200×600){{ $form?->image_path ? '. Choosing a file replaces the current one' : '' }}.</p>
                        @error('image')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <div class="grid grid-cols-5 gap-3">
                        <fieldset class="fieldset col-span-2">
                            <legend class="fieldset-legend">Button</legend>
                            <input type="text" name="cta_label" value="{{ old('cta_label', $form?->cta_label) }}" maxlength="40"
                                   placeholder="Get Pro" class="input w-full @error('cta_label') input-error @enderror">
                            @error('cta_label')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                        <fieldset class="fieldset col-span-3">
                            <legend class="fieldset-legend">Goes to</legend>
                            <input type="text" name="cta_url" value="{{ old('cta_url', $form?->cta_url) }}" maxlength="500"
                                   placeholder="https://app.lava.top/… or /dashboard/…" class="input w-full font-mono text-xs @error('cta_url') input-error @enderror">
                            @error('cta_url')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                    </div>
                    <p class="-mt-2 text-xs opacity-60">
                        Both optional. For a card/PayPal offer, paste the lava.top link: it opens in a new tab, tagged with the account so the payment finds it.
                        For a digital-currency coupon, use its "Copy link" from Coupons &amp; sales: it opens checkout with the code filled in.
                    </p>

                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Starts (UTC)</legend>
                            <input type="datetime-local" name="starts_at" value="{{ old('starts_at', $form?->starts_at?->format('Y-m-d\TH:i')) }}" class="input w-full">
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Ends (UTC)</legend>
                            <input type="datetime-local" name="ends_at" value="{{ old('ends_at', $form?->ends_at?->format('Y-m-d\TH:i')) }}"
                                   class="input w-full @error('ends_at') input-error @enderror">
                            @error('ends_at')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                    </div>
                    <p class="-mt-2 text-xs opacity-60">Both optional. An offer with an end date shows "Ends …" in the dialog and on the chip.</p>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Test list</legend>
                        <textarea name="preview_emails" rows="2" maxlength="1000"
                                  class="textarea w-full font-mono text-xs @error('preview_emails') textarea-error @enderror"
                                  placeholder="you@example.com">{{ old('preview_emails', $form?->preview_emails) }}</textarea>
                        <p class="label">These accounts see it even while it's off or before it starts, marked as a preview. Leave it off, check it in your own dashboard, then switch it on.</p>
                        @error('preview_emails')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Priority</legend>
                            <input type="number" name="priority" min="-100" max="100" value="{{ old('priority', $form?->priority ?? 0) }}" class="input w-full">
                            <p class="label">Higher opens first. One dialog per visit; the rest wait as chips.</p>
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Key</legend>
                            <input type="text" name="key" value="{{ old('key', $form?->key) }}" maxlength="64"
                                   placeholder="auto from the title" class="input w-full font-mono text-xs @error('key') input-error @enderror">
                            @error('key')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                    </div>

                    <label class="label cursor-pointer justify-start gap-3">
                        <input type="hidden" name="active" value="0">
                        <input type="checkbox" name="active" value="1" class="toggle toggle-sm" @checked(old('active', $form?->active ?? false))>
                        <span>On (everyone in the audience sees it)</span>
                    </label>

                    <div class="card-actions justify-end">
                        @if ($form)
                            <a href="{{ route('admin.spotlights.index') }}" class="btn btn-ghost">Cancel</a>
                        @endif
                        <button type="submit" class="btn btn-primary">{{ $form ? 'Save' : 'Create' }}</button>
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
                                    <th>Spotlight</th>
                                    <th>Who</th>
                                    <th>When</th>
                                    <th title="Opened / closed it (it stays as a chip) / clicked the button">Seen · closed · clicked</th>
                                    <th class="text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse ($spotlights as $spotlight)
                                    @php($counts = $stats[$spotlight->id] ?? ['seen' => 0, 'minimized' => 0, 'clicked' => 0])
                                    <tr class="hover:bg-base-200 align-top">
                                        <td>
                                            <div class="font-medium">{{ $spotlight->title }}</div>
                                            <div class="flex items-center gap-2">
                                                <span class="badge badge-ghost badge-sm">{{ $spotlight->kind }}</span>
                                                <span class="font-mono text-xs opacity-60">{{ $spotlight->key }}</span>
                                            </div>
                                        </td>
                                        <td class="whitespace-nowrap text-sm">
                                            {{ ['all' => 'Everyone', 'free' => 'Free', 'pro' => 'Paid'][$spotlight->audience] ?? $spotlight->audience }}
                                            @if ($spotlight->previewEmails() !== [])
                                                <div class="text-xs opacity-60">+ {{ count($spotlight->previewEmails()) }} on test list</div>
                                            @endif
                                        </td>
                                        <td class="whitespace-nowrap text-sm">
                                            @if (! $spotlight->active)
                                                <span class="badge badge-ghost badge-sm">off</span>
                                            @elseif ($spotlight->isRunning())
                                                <span class="badge badge-success badge-sm">showing</span>
                                            @elseif ($spotlight->starts_at?->isFuture())
                                                <span class="badge badge-ghost badge-sm">starts {{ $spotlight->starts_at->toFormattedDateString() }}</span>
                                            @else
                                                <span class="badge badge-ghost badge-sm">ended</span>
                                            @endif
                                            @if ($spotlight->ends_at && $spotlight->isRunning())
                                                <div class="text-xs opacity-60">until {{ $spotlight->ends_at->toDayDateTimeString() }}</div>
                                            @endif
                                        </td>
                                        <td class="whitespace-nowrap font-mono text-sm">
                                            {{ $counts['seen'] }} · {{ $counts['minimized'] }} · {{ $counts['clicked'] }}
                                        </td>
                                        <td class="text-right">
                                            <div class="flex justify-end gap-1">
                                                @if ($spotlight->previewEmails() !== [])
                                                    <form method="POST" action="{{ route('admin.spotlights.reset-preview', $spotlight) }}">
                                                        @csrf
                                                        <button type="submit" class="btn btn-ghost btn-xs" title="Open it again for the test list">Reset test</button>
                                                    </form>
                                                @endif
                                                <a href="{{ route('admin.spotlights.index', ['edit' => $spotlight->id]) }}" class="btn btn-ghost btn-xs">Edit</a>
                                            </div>
                                        </td>
                                    </tr>
                                @empty
                                    <tr><td colspan="5" class="py-10 text-center opacity-60">No spotlights yet.</td></tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    </div>
@endsection
