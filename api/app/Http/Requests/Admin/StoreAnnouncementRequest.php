<?php

namespace App\Http\Requests\Admin;

use App\Notifications\Bell\BellPayload;
use App\Notifications\ProductUpdate;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Validates an announcement before it is previewed or sent.
 *
 * Shared by both steps on purpose — the preview and the send post the same
 * fields, and a preview validated by looser rules than the send is a preview
 * of something that cannot be sent.
 *
 * The lengths here are tighter than BellPayload's, which has none. That is the
 * difference between what the payload can CARRY and what the bell can SHOW: a
 * 400px dropdown clamps the body to two lines and the row to one, so a
 * three-sentence headline is not stored wrong, it is just never read. Nobody
 * writing an announcement can see that, hence the limits.
 */
class StoreAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user('admin') !== null;
    }

    /**
     * Turn what the form is comfortable collecting into what the notification
     * expects.
     *
     * Two conversions, both of which exist so the admin is not made to think
     * like the payload:
     *
     *   • Points arrive as a textarea, one per line, because that is how
     *     somebody writes three bullets. Blank lines are dropped rather than
     *     rejected — a trailing newline is not a mistake worth a validation
     *     error.
     *   • The key is generated from the headline and the month if it is left
     *     blank, so the field that has no meaning to the person writing the
     *     copy has no cost either. It is still shown and still editable,
     *     because it is the handle a resend keys off.
     */
    protected function prepareForValidation(): void
    {
        $submitted = $this->input('points', '');

        // Accepts the list as well as the textarea. The form only ever sends
        // text, but this request is the validation seam for the announcement
        // shape generally, and a caller holding an array should not have to
        // join it just so this can split it again.
        $lines = is_array($submitted)
            ? $submitted
            : preg_split('/\r\n|\r|\n/', (string) $submitted);

        $points = collect($lines)
            ->filter(fn ($line) => is_string($line))
            ->map(fn (string $line) => trim($line))
            ->filter()
            ->values()
            ->all();

        $this->merge([
            'points' => $points,
            'key' => trim((string) $this->input('key')) ?: $this->generatedKey(),
        ]);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // The key is what the duplicate guard matches on, so the pattern
            // is the notification's own rather than a second copy of it here —
            // see ProductUpdate::KEY_PATTERN for why it is so narrow.
            'key' => ['required', 'string', 'max:64', 'regex:'.ProductUpdate::KEY_PATTERN],
            'headline' => ['required', 'string', 'max:120'],
            'summary' => ['nullable', 'string', 'max:300'],
            'detail_heading' => ['nullable', 'string', 'max:60'],
            // Six is where a dropdown stops being read. There is no minimum:
            // an announcement with no points is a one-liner that links
            // straight out instead of opening a dialog.
            'points' => ['array', 'max:6'],
            'points.*' => ['string', 'max:200'],
            // A path OR a full URL. `url` alone would refuse
            // `/dashboard/settings`, which is what almost every announcement
            // actually wants to link to — and push whoever hit that into
            // pasting an absolute URL carrying whichever origin they happened
            // to be looking at. See ProductUpdate, which resolves the path.
            'url' => ['nullable', 'string', 'max:500', 'regex:#^(https?://\S+|/\S*)$#'],
            'link_label' => ['nullable', 'string', 'max:40'],
            'level' => ['required', Rule::in(BellPayload::LEVELS)],
            'icon' => ['nullable', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'key.regex' => 'The key can only hold lower-case letters, digits, dots and dashes.',
            'url.regex' => 'Use a dashboard path like /dashboard/settings, or a full https:// address.',
            'icon.regex' => 'Icon keys are lower case with dashes, like plan-upgraded.',
            'points.max' => 'Six points is the most a dropdown gets read at. Cut it down or link out instead.',
            'headline.max' => 'The headline is one line in a narrow panel — keep it under 120 characters.',
        ];
    }

    /**
     * A key nobody has to invent: the month, then the headline.
     *
     * Dated rather than just slugged, because the key's whole job is to be
     * unique forever. "New features" as a key works once and then silently
     * reaches nobody the second time somebody writes it, which is the one
     * failure mode of this page that looks exactly like success.
     */
    private function generatedKey(): string
    {
        $slug = Str::slug(Str::limit((string) $this->input('headline'), 48, ''));

        return now()->format('Y-m').'-'.($slug !== '' ? $slug : now()->format('d-His'));
    }
}
