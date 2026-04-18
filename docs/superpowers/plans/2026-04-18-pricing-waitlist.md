# Pricing Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the landing page pricing section so Pro is shown as "Coming soon" with a waitlist signup, and add-ons are shown but non-actionable, backed by a new Laravel `waitlist_entries` table and a rate-limited `POST /api/waitlist` endpoint.

**Architecture:**
- Backend: Laravel 13 adds a `waitlist_entries` table (id, email, plan, timestamps), a `WaitlistEntry` Eloquent model, a `StoreWaitlistRequest` form request, and a `WaitlistController@store` action. Route is registered at `POST /api/waitlist` with `throttle:5,60` (5 req/IP/hour). No auth.
- Frontend: `PricingSection.tsx` stays a server component. The Pro card's CTA is replaced with a new client component `WaitlistButton.tsx` that owns a shadcn `Dialog` with an email input and posts to `/waitlist` via the shared axios instance. Pro card gets a "Coming soon" badge and `opacity-85`; add-ons lose their buttons (replaced by "Coming soon" plain text) and get `opacity-80`.

**Tech Stack:** Laravel 13 + Pest 4, Eloquent, Laravel named/inline rate limiters, Next.js 16 App Router + TypeScript, Tailwind v4, shadcn/ui (`Dialog`), axios, sonner toasts.

---

## File Structure

**Create:**
- `api/database/migrations/2026_04_18_120000_create_waitlist_entries_table.php` — schema for waitlist table
- `api/app/Models/WaitlistEntry.php` — Eloquent model
- `api/app/Http/Requests/StoreWaitlistRequest.php` — request validation
- `api/app/Http/Controllers/WaitlistController.php` — single-action controller (`store`)
- `api/tests/Feature/WaitlistTest.php` — Pest feature tests
- `client/components/homepage/WaitlistButton.tsx` — client button + dialog + form
- `client/components/homepage/ComingSoonBadge.tsx` — small presentational badge (reusable)

**Modify:**
- `api/routes/api.php` — register `POST /api/waitlist` with inline throttle
- `client/components/homepage/PricingSection.tsx` — Pro card badge/dim/button swap, add-ons button swap/dim

---

## Task 1: Database migration

**Files:**
- Create: `api/database/migrations/2026_04_18_120000_create_waitlist_entries_table.php`

- [ ] **Step 1: Generate migration via Artisan**

Run:
```bash
cd /home/ammar/Desktop/personal/gocast/api && php artisan make:migration create_waitlist_entries_table --no-interaction
```
Expected: file created under `api/database/migrations/` with today's timestamp prefix. Rename if needed so the base name matches `create_waitlist_entries_table`.

- [ ] **Step 2: Fill in the migration body**

Overwrite the generated file's `up()` / `down()`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waitlist_entries', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            $table->string('plan', 30);
            $table->timestamps();

            $table->index('email');
            $table->index('plan');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waitlist_entries');
    }
};
```

Notes:
- `email` is NOT unique — the same person may join waitlists for different plans, or accidentally re-submit; dedup is a product concern, not a DB constraint.
- Indexes support later admin queries (e.g., "how many Pro signups").

- [ ] **Step 3: Run the migration**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan migrate`
Expected: `INFO  Running migrations.` followed by a line naming `create_waitlist_entries_table` and `DONE`.

- [ ] **Step 4: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add api/database/migrations/ && git commit -m "feat(waitlist): add waitlist_entries migration"
```

---

## Task 2: Eloquent model

**Files:**
- Create: `api/app/Models/WaitlistEntry.php`

- [ ] **Step 1: Generate the model via Artisan**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan make:model WaitlistEntry --no-interaction`
Expected: file created at `app/Models/WaitlistEntry.php`.

- [ ] **Step 2: Configure fillable and casts**

Replace the generated file contents with:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WaitlistEntry extends Model
{
    protected $fillable = [
        'email',
        'plan',
    ];
}
```

- [ ] **Step 3: Run Pint**

Run: `cd /home/ammar/Desktop/personal/gocast/api && vendor/bin/pint --dirty --format agent`
Expected: either no changes or a fixed-files summary. No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add api/app/Models/WaitlistEntry.php && git commit -m "feat(waitlist): add WaitlistEntry model"
```

---

## Task 3: Form request for validation

**Files:**
- Create: `api/app/Http/Requests/StoreWaitlistRequest.php`

- [ ] **Step 1: Generate the form request**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan make:request StoreWaitlistRequest --no-interaction`
Expected: file at `app/Http/Requests/StoreWaitlistRequest.php`.

- [ ] **Step 2: Implement rules and authorize**

Replace file contents with:
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreWaitlistRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email:rfc,dns', 'max:255'],
            'plan' => ['required', 'string', 'max:30'],
        ];
    }
}
```

Notes:
- `email:rfc,dns` matches Laravel's stricter email validation — same rule pattern the codebase uses on register flows (check `RegisterRequest` for the project convention; if it uses a simpler rule, match that instead).
- `plan` is a free-form string (not an enum) so we can log signups for future plans/add-ons without another migration.

- [ ] **Step 3: Pint**

Run: `cd /home/ammar/Desktop/personal/gocast/api && vendor/bin/pint --dirty --format agent`

- [ ] **Step 4: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add api/app/Http/Requests/StoreWaitlistRequest.php && git commit -m "feat(waitlist): add StoreWaitlistRequest"
```

---

## Task 4: Controller

**Files:**
- Create: `api/app/Http/Controllers/WaitlistController.php`

- [ ] **Step 1: Generate the controller**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan make:controller WaitlistController --no-interaction`

- [ ] **Step 2: Implement `store`**

Replace file contents with:
```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreWaitlistRequest;
use App\Models\WaitlistEntry;
use Illuminate\Http\JsonResponse;

class WaitlistController extends Controller
{
    public function store(StoreWaitlistRequest $request): JsonResponse
    {
        WaitlistEntry::create($request->validated());

        return response()->json([
            'message' => "You're on the list! We'll email you when Pro is ready.",
        ], 201);
    }
}
```

Note: no dedup check — the DB has no unique constraint and product copy promises a single confirmation message regardless. If product later wants "already on the list" messaging, add a check here.

- [ ] **Step 3: Pint**

Run: `cd /home/ammar/Desktop/personal/gocast/api && vendor/bin/pint --dirty --format agent`

- [ ] **Step 4: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add api/app/Http/Controllers/WaitlistController.php && git commit -m "feat(waitlist): add WaitlistController@store"
```

---

## Task 5: Register the route with rate limiting

**Files:**
- Modify: `api/routes/api.php`

- [ ] **Step 1: Add the route**

Edit `api/routes/api.php`. Add the `WaitlistController` import at the top (alphabetically placed with the other `use App\Http\Controllers\...` lines):
```php
use App\Http\Controllers\WaitlistController;
```

Then add a new top-level route block below the existing public routes block (after the `throttle:public` group that ends around line 60, before the `internal` group):
```php
// Waitlist signup — public, tightly throttled to 5 requests per IP per hour.
Route::middleware('throttle:5,60')->group(function () {
    Route::post('/waitlist', [WaitlistController::class, 'store']);
});
```

Notes:
- `throttle:5,60` = 5 requests per 60 minutes per IP (Laravel default per-route limiter key). Matches the spec exactly.
- Not placed under `throttle:public` because that limiter is tuned for higher read volume; waitlist writes need a tighter ceiling.

- [ ] **Step 2: Verify route is registered**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan route:list --path=waitlist`
Expected: one line showing `POST   api/waitlist .... WaitlistController@store`.

- [ ] **Step 3: Pint**

Run: `cd /home/ammar/Desktop/personal/gocast/api && vendor/bin/pint --dirty --format agent`

- [ ] **Step 4: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add api/routes/api.php && git commit -m "feat(waitlist): register POST /api/waitlist with 5/hour throttle"
```

---

## Task 6: Feature tests (Pest)

**Files:**
- Create: `api/tests/Feature/WaitlistTest.php`

Use the pest-testing skill for test-writing conventions in this project.

- [ ] **Step 1: Generate the test file**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan make:test --pest WaitlistTest`
Expected: file at `tests/Feature/WaitlistTest.php`.

- [ ] **Step 2: Write the test cases**

Replace file contents with:
```php
<?php

use App\Models\WaitlistEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('stores a waitlist entry and returns 201', function () {
    $response = $this->postJson('/api/waitlist', [
        'email' => 'alice@example.com',
        'plan' => 'pro',
    ]);

    $response->assertCreated()
        ->assertJson(['message' => "You're on the list! We'll email you when Pro is ready."]);

    expect(WaitlistEntry::where('email', 'alice@example.com')->where('plan', 'pro')->exists())->toBeTrue();
});

it('rejects missing email', function () {
    $this->postJson('/api/waitlist', ['plan' => 'pro'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);
});

it('rejects invalid email', function () {
    $this->postJson('/api/waitlist', [
        'email' => 'not-an-email',
        'plan' => 'pro',
    ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
});

it('rejects missing plan', function () {
    $this->postJson('/api/waitlist', ['email' => 'alice@example.com'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['plan']);
});

it('allows the same email on multiple plans', function () {
    $this->postJson('/api/waitlist', ['email' => 'bob@example.com', 'plan' => 'pro'])->assertCreated();
    $this->postJson('/api/waitlist', ['email' => 'bob@example.com', 'plan' => 'mobile-app'])->assertCreated();

    expect(WaitlistEntry::where('email', 'bob@example.com')->count())->toBe(2);
});

it('throttles after 5 requests per hour from the same IP', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/waitlist', [
            'email' => "user{$i}@example.com",
            'plan' => 'pro',
        ])->assertCreated();
    }

    $this->postJson('/api/waitlist', [
        'email' => 'sixth@example.com',
        'plan' => 'pro',
    ])->assertStatus(429);
});
```

Notes:
- `RefreshDatabase` because we assert on row counts.
- The throttle test relies on Laravel's default limiter keying on IP for unauthenticated requests — `postJson` within the same test uses the same request IP so the counter accumulates.
- If the throttle test flakes due to cache carryover between test runs, add `RateLimiter::clear('...')` in a `beforeEach` — but first verify whether `RefreshDatabase` alone suffices (the project's test env uses the array cache by default, which resets per process).

- [ ] **Step 3: Run the tests**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan test --compact --filter=WaitlistTest`
Expected: all 6 tests pass.

- [ ] **Step 4: Pint**

Run: `cd /home/ammar/Desktop/personal/gocast/api && vendor/bin/pint --dirty --format agent`

- [ ] **Step 5: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add api/tests/Feature/WaitlistTest.php && git commit -m "test(waitlist): cover happy path, validation, dedup, throttle"
```

---

## Task 7: `ComingSoonBadge` component

**Files:**
- Create: `client/components/homepage/ComingSoonBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
export default function ComingSoonBadge() {
  return (
    <div className="absolute top-4 right-4 text-[10px] tracking-[2px] uppercase text-violet-muted bg-violet-full/[0.08] border border-violet-border/40 rounded-full px-2.5 py-1">
      Coming soon
    </div>
  )
}
```

Notes:
- Uses the same `violet-*` color tokens as the existing Pro card accent — subtle, not loud.
- Positioned absolutely so parent card must remain `relative` (it already is at `PricingSection.tsx:107`).

- [ ] **Step 2: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add client/components/homepage/ComingSoonBadge.tsx && git commit -m "feat(pricing): add ComingSoonBadge component"
```

---

## Task 8: `WaitlistButton` client component

**Files:**
- Create: `client/components/homepage/WaitlistButton.tsx`

Before editing, if anything about Next.js 16 / React 19 client-component rules feels non-obvious, consult `client/node_modules/next/dist/docs/` (per `client/AGENTS.md`). The patterns below are standard `"use client"` + hooks + shadcn Dialog and should be fine as-is.

- [ ] **Step 1: Write the component**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import api from "@/lib/axios"

interface Props {
  plan: string
  className?: string
  children: React.ReactNode
}

export default function WaitlistButton({ plan, className, children }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.")
      return
    }

    setSubmitting(true)
    try {
      await api.post("/waitlist", { email, plan })
      setSubmitted(true)
      toast.success("You're on the list! We'll email you when Pro is ready.")
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined
      if (status === 429) {
        setError("Too many attempts. Please try again later.")
      } else if (status === 422) {
        setError("Please check the email address and try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setEmail("")
      setError(null)
      setSubmitted(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className={className}>
          {children}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join the Pro waitlist</DialogTitle>
          <DialogDescription>
            Enter your email and we'll notify you when Pro launches.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="py-4 text-sm text-text-muted">
            You're on the list! We'll email you when Pro is ready.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-faint focus:outline-none focus:border-violet-border/70"
              disabled={submitting}
            />
            {error && (
              <div className="text-[12px] text-red-400">{error}</div>
            )}
            <DialogFooter>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg text-[13px] font-medium bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Join the waitlist"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

Notes:
- Uses the shared axios instance from `@/lib/axios` (which already prepends the API base URL, so we POST to `/waitlist`, not `/api/waitlist`).
- Keeps styling consistent with the existing Pro CTA button.
- Shows both an inline success message and a toast — the inline message fulfils the spec (`"You're on the list! We'll email you when Pro is ready."`) and the toast is ambient feedback consistent with the rest of the app.
- Error branches for 429 (throttle) and 422 (validation) match what the Laravel endpoint will return.

- [ ] **Step 2: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add client/components/homepage/WaitlistButton.tsx && git commit -m "feat(pricing): add WaitlistButton with dialog signup"
```

---

## Task 9: Update the Pro card in `PricingSection.tsx`

**Files:**
- Modify: `client/components/homepage/PricingSection.tsx`

- [ ] **Step 1: Add imports and new plan flag**

At the top of the file (after the existing `IconCheck` import), add:
```tsx
import ComingSoonBadge from "./ComingSoonBadge"
import WaitlistButton from "./WaitlistButton"
```

Extend the `Plan` interface (currently ends at line 14) to include the waitlist flag:
```tsx
interface Plan {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  cta: string
  ctaHref: string
  popular?: boolean
  primaryCta?: boolean
  waitlist?: boolean
}
```

- [ ] **Step 2: Update the Pro plan entry**

In the `PLANS` array, replace the Pro entry (currently lines 43–63) with:
```tsx
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For serious broadcasters and growing audiences",
    features: [
      "Everything in Free",
      "5 stations",
      "500 concurrent listeners",
      "Connect OBS, BUTT, or any streaming software",
      "Scheduled broadcasts",
      "Listener analytics & geographic insights",
      "Embeddable player widget",
      "Direct stream URL for third-party players",
      "Priority support",
    ],
    cta: "Join the waitlist",
    ctaHref: "",
    popular: true,
    primaryCta: true,
    waitlist: true,
  },
```

- [ ] **Step 3: Render badge + dim + WaitlistButton**

In the `PLANS.map(...)` block, update the card wrapper (currently line 107) so the className also applies `opacity-85` when `plan.waitlist` is true, and render a `<ComingSoonBadge />` at the top of the card body.

Replace the existing card markup (lines 105–157) with:
```tsx
          <div
            key={plan.name}
            className={`relative bg-white/[0.02] border rounded-xl px-5 md:px-7 py-7 md:py-9 transition-all flex flex-col hover:-translate-y-0.5 ${
              plan.popular
                ? "border-violet-border/70 bg-violet-full/[0.04] shadow-[0_0_40px_rgba(139,92,246,0.1)]"
                : "border-white/[0.06]"
            } ${plan.waitlist ? "opacity-85" : ""}`}
          >
            {plan.waitlist && <ComingSoonBadge />}
            <div className="text-[13px] tracking-[2px] uppercase text-text-muted/85 mb-3">
              {plan.name}
            </div>
            <div className="text-4xl font-semibold text-text-primary -tracking-wide mb-1">
              {plan.price}
              {plan.period && <span className="text-sm text-text-muted font-normal"> {plan.period}</span>}
            </div>
            <div className="text-[13px] text-text-faint mb-6 leading-relaxed">
              {plan.description}
            </div>
            <ul className="list-none p-0 flex-1">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="text-[13px] text-text-muted py-1.5 flex items-center gap-2.5"
                >
                  <IconCheck size={14} className="text-violet-muted shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            {plan.waitlist ? (
              <WaitlistButton
                plan="pro"
                className="block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)] transition-all"
              >
                {plan.cta}
              </WaitlistButton>
            ) : plan.ctaHref.startsWith("mailto:") ? (
              <a
                href={plan.ctaHref}
                className={`block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium no-underline transition-all ${
                  plan.primaryCta
                    ? "bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)]"
                    : "bg-transparent text-text-muted border border-white/[0.08] hover:border-white/[0.15] hover:text-white"
                }`}
              >
                {plan.cta}
              </a>
            ) : (
              <Link
                href={plan.ctaHref}
                className={`block w-full mt-6 py-3 rounded-lg text-[13px] text-center cursor-pointer font-medium no-underline transition-all ${
                  plan.primaryCta
                    ? "bg-violet-full text-white border border-violet-full shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_4px_30px_rgba(139,92,246,0.4)]"
                    : "bg-transparent text-text-muted border border-white/[0.08] hover:border-white/[0.15] hover:text-white"
                }`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
```

Notes:
- `opacity-85` = Tailwind arbitrary `opacity-85` works in v4; equivalent to `opacity: 0.85`. Spec says 0.85 exactly.
- The `plan.waitlist` branch renders a `<WaitlistButton>` instead of a link, preserving the button's visual style.

- [ ] **Step 4: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add client/components/homepage/PricingSection.tsx && git commit -m "feat(pricing): replace Pro CTA with waitlist flow"
```

---

## Task 10: Update the add-ons section

**Files:**
- Modify: `client/components/homepage/PricingSection.tsx`

- [ ] **Step 1: Replace the two-up add-on cards' "Get in touch" anchor with plain text**

In the `ADDONS.filter(...)` block that renders the two stacked cards (lines 175–200), update:

1. Add `opacity-80` to the card wrapper className.
2. Remove the `ctaHref` from use — replace the `<a>...Get in touch</a>` block with a centered "Coming soon" caption.

Replace the card block:
```tsx
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {ADDONS.filter((a) => a.name !== "Custom Domain").map((addon) => (
            <div
              key={addon.name}
              className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-8 py-7 md:py-9 flex flex-col transition-all hover:-translate-y-0.5 shadow-[0_0_40px_rgba(139,92,246,0.1)] opacity-80"
            >
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-base font-medium text-text-secondary">
                  {addon.name}
                </div>
                <div className="text-2xl font-semibold text-text-primary -tracking-wide">
                  {addon.price}
                </div>
              </div>
              <div className="text-[13px] text-text-faint leading-[1.7] mb-6 flex-1">
                {addon.description}
              </div>
              <div className="text-[11px] tracking-[2px] uppercase text-text-faint text-center py-3">
                Coming soon
              </div>
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Replace the full-width Custom Domain add-on's button with plain text**

In the `ADDONS.filter((a) => a.name === "Custom Domain")` block (lines 203–228):

1. Add `opacity-80` to the card wrapper.
2. Replace the `<a>...Get in touch</a>` with a plain "Coming soon" span.

Replace with:
```tsx
        {ADDONS.filter((a) => a.name === "Custom Domain").map((addon) => (
          <div
            key={addon.name}
            className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 md:px-8 py-6 md:py-7 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8 transition-all hover:-translate-y-0.5 shadow-[0_0_40px_rgba(139,92,246,0.1)] opacity-80"
          >
            <div className="flex-1">
              <div className="flex items-baseline gap-3 mb-1.5">
                <div className="text-base font-medium text-text-secondary">
                  {addon.name}
                </div>
                <div className="text-lg font-semibold text-text-primary -tracking-wide">
                  {addon.price}
                </div>
              </div>
              <div className="text-[13px] text-text-faint leading-[1.7]">
                {addon.description}
              </div>
            </div>
            <div className="shrink-0 text-[11px] tracking-[2px] uppercase text-text-faint text-center md:text-right px-2">
              Coming soon
            </div>
          </div>
        ))}
```

Note: `ctaHref` on the `AddOn` interface becomes unused. Leave it in the interface and in the data for now — removing it is out of scope and could trigger churn in tests/fixtures we haven't surveyed.

- [ ] **Step 3: Commit**

```bash
cd /home/ammar/Desktop/personal/gocast && git add client/components/homepage/PricingSection.tsx && git commit -m "feat(pricing): mark add-ons as coming soon and dim cards"
```

---

## Task 11: Manual verification in the browser

- [ ] **Step 1: Start the backend**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan serve`
Expected: serving on `http://127.0.0.1:8000` (or existing configured host — check `.env`).

- [ ] **Step 2: Start the frontend**

In a second shell: `cd /home/ammar/Desktop/personal/gocast/client && npm run dev`
Expected: Next.js dev server running, typically on `http://localhost:3000`.

- [ ] **Step 3: Golden-path check**

In the browser, visit the landing page and scroll to the `#pricing` section. Verify:
- Free card renders unchanged with "Start broadcasting" button linking to `/auth/register`.
- Pro card has a "Coming soon" badge in the top right, is visibly dimmed, and features are all visible.
- Pro button says "Join the waitlist". Clicking it opens a dialog.
- Submitting `you@example.com` closes the form state into a success message and a toast appears.
- Visiting the DB shows a new `waitlist_entries` row with that email and `plan='pro'`.
- Add-ons section shows all three cards (Custom Player Page, Mobile App, Custom Domain), each dimmed, with "Coming soon" text instead of "Get in touch" buttons.

- [ ] **Step 4: Edge cases**

- Submit an invalid email (e.g. `abc`): the client shows the inline "Please enter a valid email address." message and does not POST.
- Submit 6 times in a row quickly with valid emails: the 6th request gets a 429 and the client shows "Too many attempts. Please try again later." (If the limiter doesn't reset between requests in dev, wait an hour or clear the cache to re-test the happy path.)
- Close and re-open the dialog: email field is cleared, success state resets.

- [ ] **Step 5: Run the full backend test suite once**

Run: `cd /home/ammar/Desktop/personal/gocast/api && php artisan test --compact`
Expected: all tests (including the new `WaitlistTest` cases) pass.

- [ ] **Step 6: Pint one more time across the whole `api` dir**

Run: `cd /home/ammar/Desktop/personal/gocast/api && vendor/bin/pint --dirty --format agent`
Expected: no diffs or only trivial whitespace fixes.

- [ ] **Step 7: Report completion**

Using superpowers:verification-before-completion, confirm each item above was actually observed (not assumed) before telling the user the task is done.
