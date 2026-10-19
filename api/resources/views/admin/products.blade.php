@extends('admin.layout')

@section('title', 'Products & prices')

@section('content')
    @php($form = $editing)
    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-1">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST"
                      action="{{ $form ? route('admin.products.update', $form) : route('admin.products.store') }}"
                      class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">{{ $form ? 'Edit '.$form->name : 'New product' }}</h2>
                        <p class="text-sm opacity-70">
                            Shows in the Get Pro dialog as soon as you save. Changing a price never changes what anybody already paid.
                        </p>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Name</legend>
                        <input type="text" name="name" value="{{ old('name', $form?->name) }}" required maxlength="80"
                               placeholder="Pro · 3 months" class="input w-full @error('name') input-error @enderror">
                        @error('name')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Slug</legend>
                        <input type="text" name="slug" value="{{ old('slug', $form?->slug) }}" required maxlength="60"
                               placeholder="pro-3-months" class="input w-full font-mono @error('slug') input-error @enderror">
                        <p class="label">Used in links like /dashboard/settings?product=pro-3-months. Changing it breaks links already sent.</p>
                        @error('slug')<p class="label text-error">{{ $message }}</p>@enderror
                    </fieldset>

                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Price (USD)</legend>
                            <input type="number" name="price_usd" step="0.01" min="1" value="{{ old('price_usd', $form?->price_usd) }}" required
                                   class="input w-full @error('price_usd') input-error @enderror">
                            @error('price_usd')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Plan</legend>
                            <select name="plan_id" class="select w-full @error('plan_id') select-error @enderror">
                                @foreach ($plans as $plan)
                                    <option value="{{ $plan->id }}" @selected((int) old('plan_id', $form?->plan_id) === $plan->id)>{{ $plan->name }}</option>
                                @endforeach
                            </select>
                            @error('plan_id')<p class="label text-error">{{ $message }}</p>@enderror
                        </fieldset>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Length</legend>
                            <input type="number" name="duration_count" min="1" max="120" value="{{ old('duration_count', $form?->duration_count ?? 1) }}"
                                   class="input w-full @error('duration_count') input-error @enderror">
                            @error('duration_count')<p class="label text-error">{{ $message }}</p>@enderror
                            <p class="label">Ignored for lifetime.</p>
                        </fieldset>
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Unit</legend>
                            <select name="duration_unit" class="select w-full">
                                @foreach ($units as $unit)
                                    <option value="{{ $unit }}" @selected(old('duration_unit', $form?->duration_unit ?? 'month') === $unit)>{{ $unit === \App\Models\Product::UNIT_LIFETIME ? 'lifetime (no end date)' : $unit.'s' }}</option>
                                @endforeach
                            </select>
                        </fieldset>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Badge</legend>
                        <input type="text" name="badge" value="{{ old('badge', $form?->badge) }}" maxlength="40"
                               placeholder="Best value" class="input w-full">
                        <p class="label">Optional. A short tag on the option in the dialog.</p>
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Description</legend>
                        <input type="text" name="description" value="{{ old('description', $form?->description) }}" maxlength="255"
                               class="input w-full">
                        <p class="label">Optional. One line under the option.</p>
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Order</legend>
                        <input type="number" name="sort" value="{{ old('sort', $form?->sort ?? 0) }}" class="input w-full">
                        <p class="label">Lower numbers are listed first.</p>
                    </fieldset>

                    <label class="label cursor-pointer justify-start gap-3">
                        <input type="hidden" name="active" value="0">
                        <input type="checkbox" name="active" value="1" class="toggle toggle-sm" @checked(old('active', $form?->active ?? true))>
                        <span>On sale <span class="opacity-60">— off means nobody can buy it, even by link</span></span>
                    </label>
                    <label class="label cursor-pointer justify-start gap-3">
                        <input type="hidden" name="visible" value="0">
                        <input type="checkbox" name="visible" value="1" class="toggle toggle-sm" @checked(old('visible', $form?->visible ?? true))>
                        <span>Listed <span class="opacity-60">— off hides it from the dialog; the link still works</span></span>
                    </label>

                    <div class="card-actions justify-end">
                        @if ($form)
                            <a href="{{ route('admin.products.index') }}" class="btn btn-ghost">Cancel</a>
                        @endif
                        <button type="submit" class="btn btn-primary">{{ $form ? 'Save' : 'Create product' }}</button>
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
                                    <th>Product</th>
                                    <th>Price</th>
                                    <th>Grants</th>
                                    <th>Sold</th>
                                    <th>State</th>
                                    <th class="text-right"></th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse ($products as $product)
                                    <tr class="hover:bg-base-200 align-top">
                                        <td>
                                            <div class="font-medium">{{ $product->name }}
                                                @if ($product->badge)<span class="badge badge-ghost badge-sm">{{ $product->badge }}</span>@endif
                                            </div>
                                            <div class="font-mono text-xs opacity-50">{{ $product->slug }}</div>
                                        </td>
                                        <td class="whitespace-nowrap">${{ $product->price_usd }}</td>
                                        <td class="whitespace-nowrap text-sm">{{ $product->plan?->name ?? '?' }} · {{ $product->durationLabel() }}</td>
                                        <td>{{ $paidCounts[$product->id] ?? 0 }}</td>
                                        <td class="text-sm">
                                            @if (! $product->active)
                                                <span class="badge badge-ghost badge-sm">off</span>
                                            @elseif (! $product->visible)
                                                <span class="badge badge-info badge-sm" title="Buyable only by link">link only</span>
                                            @else
                                                <span class="badge badge-success badge-sm">listed</span>
                                            @endif
                                        </td>
                                        <td class="text-right">
                                            <div class="flex justify-end gap-1">
                                                @if ($product->active)
                                                    <input type="text" readonly class="hidden" id="product-link-{{ $product->id }}"
                                                           value="{{ $frontendUrl }}/dashboard/settings?product={{ $product->slug }}">
                                                    <button type="button" class="btn btn-ghost btn-xs" data-copy="#product-link-{{ $product->id }}"
                                                            title="A link that opens checkout with this product picked">Copy link</button>
                                                @endif
                                                <a href="{{ route('admin.products.index', ['edit' => $product->id]) }}" class="btn btn-ghost btn-xs">Edit</a>
                                            </div>
                                        </td>
                                    </tr>
                                @empty
                                    <tr><td colspan="6" class="py-10 text-center opacity-60">Nothing for sale yet.</td></tr>
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
