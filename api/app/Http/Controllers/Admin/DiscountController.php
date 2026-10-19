<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Discount;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Illuminate\View\View;

/**
 * Coupons and sales, on one page because they are one thing: a discount with
 * a code is a coupon the buyer types; one without is a sale everybody gets
 * while it runs.
 *
 * A new coupon defaults to one use — one code per person, as founders get
 * theirs. Uses are counted when a payment is confirmed (PaymentProcessor).
 */
class DiscountController extends Controller
{
    public function index(Request $request): View
    {
        $editing = $request->query('edit') ? Discount::with('products')->find($request->query('edit')) : null;

        return view('admin.discounts', [
            'discounts' => Discount::with('products')->latest('id')->get(),
            'products' => Product::orderBy('sort')->orderBy('id')->get(),
            'editing' => $editing,
            'frontendUrl' => rtrim((string) config('services.frontend_url'), '/'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        [$data, $products] = $this->validated($request);
        $discount = Discount::create($data);
        $discount->products()->sync($products);

        return redirect()->route('admin.discounts.index')->with('status', $discount->isCoupon()
            ? "Coupon {$discount->code} created."
            : "Sale \"{$discount->name}\" created.");
    }

    public function update(Request $request, Discount $discount): RedirectResponse
    {
        [$data, $products] = $this->validated($request, $discount);
        $discount->update($data);
        $discount->products()->sync($products);

        return redirect()->route('admin.discounts.index')->with('status', "Saved {$discount->name}.");
    }

    /**
     * @return array{0: array<string, mixed>, 1: list<int>}
     */
    private function validated(Request $request, ?Discount $discount = null): array
    {
        $request->merge(['code' => Discount::normalizeCode($request->input('code'))]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'code' => ['nullable', 'string', 'max:60', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('discounts', 'code')->ignore($discount)],
            'kind' => ['required', Rule::in(['percent', 'amount'])],
            'value' => ['required', 'numeric', 'gt:0'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'max_redemptions' => ['nullable', 'integer', 'min:1'],
            'per_user_limit' => ['nullable', 'integer', 'min:1'],
            'products' => ['nullable', 'array'],
            'products.*' => ['integer', Rule::exists('products', 'id')],
        ], [
            'code.regex' => 'Letters, numbers, dashes and underscores only.',
        ]);

        validator($data, [])->after(function (Validator $validator) use ($data) {
            if ($data['kind'] === 'percent' && (float) $data['value'] >= 100) {
                $validator->errors()->add('value', 'A percentage must be under 100. Free plans are granted from Stations, not sold.');
            }

            if (! empty($data['starts_at']) && ! empty($data['ends_at']) && strtotime($data['ends_at']) <= strtotime($data['starts_at'])) {
                $validator->errors()->add('ends_at', 'The end must be after the start.');
            }
        })->validate();

        return [[
            'name' => $data['name'],
            'code' => $data['code'] ?? null,
            'percent_off' => $data['kind'] === 'percent' ? $data['value'] : null,
            'amount_off_usd' => $data['kind'] === 'amount' ? $data['value'] : null,
            'starts_at' => $data['starts_at'] ?? null,
            'ends_at' => $data['ends_at'] ?? null,
            'max_redemptions' => $data['max_redemptions'] ?? null,
            'per_user_limit' => $data['per_user_limit'] ?? null,
            'active' => $request->boolean('active'),
        ], array_map('intval', $data['products'] ?? [])];
    }
}
