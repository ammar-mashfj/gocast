<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/**
 * What checkout sells. Creating or editing a row here changes the Get Pro
 * dialog and the homepage price with no deploy.
 *
 * No delete: payments point at products, and a product that should stop
 * selling is switched off (`active`), which keeps its history readable.
 * Editing a price never touches past payments — they carry their own copy.
 */
class ProductController extends Controller
{
    public function index(Request $request): View
    {
        $editing = $request->query('edit') ? Product::find($request->query('edit')) : null;

        return view('admin.products', [
            'products' => Product::with('plan')->withCount(['discounts'])->orderBy('sort')->orderBy('id')->get(),
            'paidCounts' => Payment::whereNotNull('granted_at')->selectRaw('product_id, count(*) as c')->groupBy('product_id')->pluck('c', 'product_id'),
            'plans' => Plan::orderBy('id')->get()->reject->isFree()->values(),
            'editing' => $editing,
            'units' => Product::DURATION_UNITS,
            'frontendUrl' => rtrim((string) config('services.frontend_url'), '/'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $product = Product::create($this->validated($request));

        return redirect()->route('admin.products.index')->with('status', "Created {$product->name}.");
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $product->update($this->validated($request, $product));

        return redirect()->route('admin.products.index')->with('status', "Saved {$product->name}. Payments already made keep the price they were charged.");
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Product $product = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'slug' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/', Rule::unique('products', 'slug')->ignore($product)],
            'description' => ['nullable', 'string', 'max:255'],
            'badge' => ['nullable', 'string', 'max:40'],
            'price_usd' => ['required', 'numeric', 'min:1', 'max:100000'],
            'plan_id' => ['required', Rule::exists('plans', 'id')],
            'duration_unit' => ['required', Rule::in(Product::DURATION_UNITS)],
            'duration_count' => ['exclude_if:duration_unit,'.Product::UNIT_LIFETIME, 'required', 'integer', 'min:1', 'max:120'],
            'sort' => ['nullable', 'integer'],
        ], [
            'slug.regex' => 'Lower-case letters, numbers and single dashes only, like pro-3-months.',
        ]);

        return $data + [
            // A lifetime has no length; a stale number from the form is dropped.
            'duration_count' => null,
            'grant_type' => Product::GRANT_PLAN_TERM,
            'sort' => (int) ($data['sort'] ?? 0),
            'active' => $request->boolean('active'),
            'visible' => $request->boolean('visible'),
        ];
    }
}
