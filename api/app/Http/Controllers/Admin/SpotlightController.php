<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Spotlight;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Illuminate\View\View;

/**
 * Spotlights: the dialog an account gets on its next dashboard visit.
 *
 * One page in the Discounts shape (form on the left, list on the right, edit
 * in place) because unlike an announcement a spotlight CAN be taken back:
 * switching it off, or moving its end date, takes it out of every dashboard
 * on the next load. So there is no two-step send here; the test list is the
 * preview instead — the addresses in it see the spotlight in the real
 * dashboard even while it is switched off.
 */
class SpotlightController extends Controller
{
    public function index(Request $request): View
    {
        $editing = $request->query('edit') ? Spotlight::find($request->query('edit')) : null;

        return view('admin.spotlights', [
            'spotlights' => Spotlight::query()->latest('id')->get(),
            'stats' => $this->stats(),
            'editing' => $editing,
            'kinds' => Spotlight::KINDS,
            'audiences' => Spotlight::AUDIENCES,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $spotlight = Spotlight::create($this->withImage($request, $this->validated($request)));

        return redirect()->route('admin.spotlights.index')->with('status', "Spotlight \"{$spotlight->title}\" created.");
    }

    public function update(Request $request, Spotlight $spotlight): RedirectResponse
    {
        $spotlight->update($this->withImage($request, $this->validated($request, $spotlight), $spotlight));

        return redirect()->route('admin.spotlights.index')->with('status', "Saved \"{$spotlight->title}\".");
    }

    /**
     * Forget what the test list did with it, so the dialog opens for them
     * again. Only the test list: resetting real accounts would re-open
     * something every one of them already minimised.
     */
    public function resetPreview(Spotlight $spotlight): RedirectResponse
    {
        $emails = $spotlight->previewEmails();
        $ids = $emails === [] ? [] : User::query()->whereIn(DB::raw('lower(email)'), $emails)->pluck('id')->all();

        $cleared = $ids === [] ? 0 : DB::table('spotlight_user')
            ->where('spotlight_id', $spotlight->id)
            ->whereIn('user_id', $ids)
            ->delete();

        return redirect()->route('admin.spotlights.index')->with('status', $cleared > 0
            ? 'Reset for the test list. It opens again on their next dashboard load.'
            : 'Nothing to reset: nobody on the test list has opened it yet.');
    }

    /**
     * Store a newly uploaded image, or drop the current one when "Remove" is
     * ticked. The replaced file is deleted only after the new one is stored,
     * so a failed upload never leaves the spotlight pointing at nothing.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withImage(Request $request, array $data, ?Spotlight $spotlight = null): array
    {
        $old = $spotlight?->image_path;

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store(Spotlight::IMAGE_DIRECTORY, 'public');
        } elseif ($request->boolean('remove_image')) {
            $data['image_path'] = null;
        } else {
            return $data;
        }

        if ($old !== null && $old !== $data['image_path']) {
            Storage::disk('public')->delete($old);
        }

        return $data;
    }

    /**
     * Seen / minimised / clicked, per spotlight.
     *
     * @return array<int, array{seen: int, minimized: int, clicked: int}>
     */
    private function stats(): array
    {
        return DB::table('spotlight_user')
            ->groupBy('spotlight_id')
            ->selectRaw('spotlight_id, count(seen_at) as seen, count(minimized_at) as minimized, count(clicked_at) as clicked')
            ->get()
            ->mapWithKeys(fn (object $row) => [(int) $row->spotlight_id => [
                'seen' => (int) $row->seen,
                'minimized' => (int) $row->minimized,
                'clicked' => (int) $row->clicked,
            ]])
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Spotlight $spotlight = null): array
    {
        $request->merge([
            'key' => trim((string) $request->input('key'))
                ?: now()->format('Y-m').'-'.(Str::slug(Str::limit((string) $request->input('title'), 48, '')) ?: now()->format('d-His')),
        ]);

        $data = $request->validate([
            'key' => ['required', 'string', 'max:64', 'regex:'.Spotlight::KEY_PATTERN, Rule::unique('spotlights', 'key')->ignore($spotlight)],
            'kind' => ['required', Rule::in(Spotlight::KINDS)],
            'title' => ['required', 'string', 'max:120'],
            'chip_label' => ['nullable', 'string', 'max:32'],
            'body' => ['nullable', 'string', 'max:2000'],
            // No SVG: it can carry script, and it is served from our origin.
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:2048'],
            'cta_label' => ['nullable', 'required_with:cta_url', 'string', 'max:40'],
            // A dashboard path or a full https:// address, as announcements take.
            'cta_url' => ['nullable', 'string', 'max:500', 'regex:#^(https://\S+|/\S*)$#'],
            'audience' => ['required', Rule::in(Spotlight::AUDIENCES)],
            'preview_emails' => ['nullable', 'string', 'max:1000'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'priority' => ['nullable', 'integer', 'between:-100,100'],
        ], [
            'key.regex' => 'Lower-case letters, digits, dots and dashes only.',
            'cta_url.regex' => 'Use a dashboard path like /dashboard/settings?coupon=BF2026, or a full https:// address.',
            'image.max' => 'Keep the image under 2 MB.',
            'cta_label.required_with' => 'A link needs a button label.',
        ]);

        validator($data, [])->after(function (Validator $validator) use ($data) {
            if (! empty($data['starts_at']) && ! empty($data['ends_at']) && strtotime($data['ends_at']) <= strtotime($data['starts_at'])) {
                $validator->errors()->add('ends_at', 'The end must be after the start.');
            }

            foreach (preg_split('/[\s,;]+/', (string) ($data['preview_emails'] ?? ''), -1, PREG_SPLIT_NO_EMPTY) as $email) {
                if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                    $validator->errors()->add('preview_emails', "\"{$email}\" is not an email address.");
                    break;
                }
            }
        })->validate();

        unset($data['image']);

        return [
            ...$data,
            'body' => $data['body'] ?? null,
            'chip_label' => $data['chip_label'] ?? null,
            'priority' => (int) ($data['priority'] ?? 0),
            'active' => $request->boolean('active'),
        ];
    }
}
