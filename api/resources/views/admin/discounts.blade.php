@extends('admin.layout')

@section('title', 'Coupons & sales')

@section('content')
    @php($form = $editing)
    @php($selected = collect(old('products', $form?->products->pluck('id')->all() ?? []))->map(fn ($id) => (int) $id))
    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST"
                      action="{{ $form ? route('admin.discounts.update', $form) : route('admin.discounts.store') }}"
                      class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">{{ $form ? 'Edit '.$form->name : 'New coupon or sale' }}</h2>
                        <p class="text-sm opacity-70">
                            With a code it's a coupon the buyer types. Leave the code blank and it's a sale everybody gets between the dates.
                            Discounts never stack: the buyer gets whichever takes off more.
                        </p>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Name</legend>
                        <input type="text" name="name" value="{{ old('name', $form?->name) }}" required maxlength="80"
                               placeholder="Founder price — MAF FM" class="input w-full @error('name') input-error @enderror">
                        <p class="label">Only you see this.</p>
                        @error('name')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Code</legend>
                        <input type="text" name="code" value="{{ old('code', $form?->code) }}" maxlength="60"
                               placeholder="FOUNDER-MAF" class="input w-full font-mono uppercase @error('code') input-error @enderror">
                        <p class="label">Blank = automatic sale. Not case-sensitive.</p>
                        @error('code')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    @php($kind = old('kind', $form && $form->amount_off_usd !== null ? 'amount' : 'percent'))
                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Type</legend>
                            <select name="kind" class="select w-full">
                                <option value="percent" @selected($kind === 'percent')>% off</option>
                                <option value="amount" @selected($kind === 'amount')>$ off</option>
                            </select>
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Amount</legend>
                            <input type="number" name="value" step="0.01" min="0.01" required
                                   value="{{ old('value', $form ? ($form->percent_off ?? $form->amount_off_usd) : '') }}"
                                   class="input w-full @error('value') input-error @enderror">
                            @error('value')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Applies to</legend>
                        <select name="products[]" multiple size="{{ min(6, max(2, $products->count())) }}" class="select h-auto w-full py-1">
                            @foreach ($products as $product)
                                <option value="{{ $product->id }}" @selected($selected->contains($product->id))>{{ $product->name }} — ${{ $product->price_usd }}</option>
                            @endforeach
                        </select>
                        <p class="label">Pick none for every product. Ctrl/Cmd-click to pick several.</p>
                        @error('products')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

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
                    <p class="-mt-2 text-xs opacity-60">Both optional. A sale with an end date shows a countdown in the dialog.</p>

                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Total uses</legend>
                            <input type="number" name="max_redemptions" min="1"
                                   value="{{ old('max_redemptions', $form ? $form->max_redemptions : 1) }}" class="input w-full">
                            <p class="label">Keep 1 for a personal coupon. For a sale, clear it (blank = unlimited) or set a cap like "first 50".</p>
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Per account</legend>
                            <input type="number" name="per_user_limit" min="1" value="{{ old('per_user_limit', $form?->per_user_limit) }}" class="input w-full">
                            <p class="label">Blank = no limit.</p>
                        </fieldset>
                    </div>

                    <label class="label cursor-pointer justify-start gap-3">
                        <input type="hidden" name="active" value="0">
                        <input type="checkbox" name="active" value="1" class="toggle toggle-sm" @checked(old('active', $form?->active ?? true))>
                        <span>Active</span>
                    </label>

                    <div class="card-actions justify-end">
                        @if ($form)
                            <a href="{{ route('admin.discounts.index') }}" class="btn btn-ghost">Cancel</a>
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
                                    <th>Discount</th>
                                    <th>Off</th>
                                    <th>Applies to</th>
                                    <th>Used</th>
                                    <th>When</th>
                                    <th class="text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse ($discounts as $discount)
                                    <tr class="hover:bg-base-200 align-top">
                                        <td>
                                            <div class="font-medium">{{ $discount->name }}</div>
                                            @if ($discount->code)
                                                <div class="font-mono text-xs">{{ $discount->code }}</div>
                                            @else
                                                <span class="badge badge-info badge-sm">automatic sale</span>
                                            @endif
                                        </td>
                                        <td class="whitespace-nowrap">{{ $discount->describe() }}</td>
                                        <td class="text-sm">
                                            {{ $discount->products->isEmpty() ? 'Everything' : $discount->products->pluck('name')->implode(', ') }}
                                        </td>
                                        <td class="whitespace-nowrap">
                                            {{ $discount->redemptions_count }}{{ $discount->max_redemptions ? ' / '.$discount->max_redemptions : '' }}
                                        </td>
                                        <td class="whitespace-nowrap text-sm">
                                            @if (! $discount->active)
                                                <span class="badge badge-ghost badge-sm">off</span>
                                            @elseif ($discount->isUsedUp())
                                                <span class="badge badge-ghost badge-sm">used up</span>
                                            @elseif ($discount->isRunning())
                                                <span class="badge badge-success badge-sm">running</span>
                                            @elseif ($discount->starts_at?->isFuture())
                                                <span class="badge badge-ghost badge-sm">starts {{ $discount->starts_at->toFormattedDateString() }}</span>
                                            @else
                                                <span class="badge badge-ghost badge-sm">ended</span>
                                            @endif
                                            @if ($discount->ends_at && $discount->isRunning())
                                                <div class="text-xs opacity-60">until {{ $discount->ends_at->toDayDateTimeString() }}</div>
                                            @endif
                                        </td>
                                        <td class="text-right">
                                            <div class="flex justify-end gap-1">
                                                @if ($discount->code)
                                                    <input type="text" readonly class="hidden" id="coupon-link-{{ $discount->id }}"
                                                           value="{{ $frontendUrl }}/dashboard/settings?coupon={{ $discount->code }}">
                                                    <button type="button" class="btn btn-ghost btn-xs" data-copy="#coupon-link-{{ $discount->id }}"
                                                            title="A link that opens checkout with this coupon filled in">Copy link</button>
                                                @endif
                                                <a href="{{ route('admin.discounts.index', ['edit' => $discount->id]) }}" class="btn btn-ghost btn-xs">Edit</a>
                                            </div>
                                        </td>
                                    </tr>
                                @empty
                                    <tr><td colspan="6" class="py-10 text-center opacity-60">No coupons or sales yet.</td></tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    </div>

    @include('admin.partials.copy-script')
@endsection
