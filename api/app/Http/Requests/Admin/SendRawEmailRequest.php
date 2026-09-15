<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates an admin-composed email before it is previewed or sent.
 *
 * Shared by both steps on purpose — the preview and the send post the same
 * fields, and a preview validated by looser rules than the send is a preview
 * of something that cannot be sent.
 */
class SendRawEmailRequest extends FormRequest
{
    /**
     * Enough addresses for a beta cohort, few enough that this is not a
     * mailing list. The send is inline and one message per address, so the
     * ceiling is also what keeps a stray paste from tying up the request for
     * a minute — and anything genuinely large wants a real campaign tool, not
     * a textarea.
     */
    public const MAX_RECIPIENTS = 100;

    public function authorize(): bool
    {
        return $this->user('admin') !== null;
    }

    /**
     * Turn the addresses textarea into a list.
     *
     * Commas, semicolons and newlines all separate, because all three are what
     * comes out of the place the admin copied the addresses from — a
     * spreadsheet column, a To: line, a chat message. Duplicates are dropped
     * case-insensitively rather than rejected: the same address twice is a
     * paste, not a decision, and sending twice is the only outcome nobody
     * wanted.
     */
    protected function prepareForValidation(): void
    {
        $submitted = $this->input('recipients', '');

        $parts = is_array($submitted)
            ? $submitted
            : preg_split('/[\s,;]+/', (string) $submitted);

        $this->merge([
            'recipients' => collect($parts ?: [])
                ->filter(fn ($value) => is_string($value))
                ->map(fn (string $value) => trim($value))
                ->filter()
                // Keyed by the lowercased form so the casing that was typed
                // survives into the envelope while the comparison does not
                // depend on it.
                ->keyBy(fn (string $email) => mb_strtolower($email))
                ->values()
                ->all(),
            // An unchecked checkbox posts nothing, so the absent case has to
            // mean false explicitly rather than by omission.
            'marketing' => $this->boolean('marketing'),
        ]);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'recipients' => ['required', 'array', 'min:1', 'max:'.self::MAX_RECIPIENTS],
            'recipients.*' => ['string', 'email', 'max:255'],

            // The subject is the only field every recipient is guaranteed to
            // read, and the one this template does not repeat anywhere on
            // screen — so it is required even though the body could stand
            // alone.
            'subject' => ['required', 'string', 'max:150'],
            'body' => ['required', 'string', 'max:20000'],

            'greeting' => ['nullable', 'string', 'max:120'],
            'headline' => ['nullable', 'string', 'max:200'],
            'sign_off' => ['nullable', 'string', 'max:120'],
            'preheader' => ['nullable', 'string', 'max:150'],

            // An absolute URL, unlike an announcement's: this lands in a mail
            // client, which has no origin to resolve a path against.
            'cta_url' => ['nullable', 'string', 'url:http,https', 'max:2048', 'required_with:cta_label'],
            'cta_label' => ['nullable', 'string', 'max:40', 'required_with:cta_url'],

            'marketing' => ['boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'recipients.required' => 'Nobody to send to — add at least one address.',
            'recipients.max' => 'That is more than '.self::MAX_RECIPIENTS.' addresses. Send it in batches, or use a campaign tool.',
            'recipients.*.email' => 'Not an address: :input',
            'cta_url.required_with' => 'A button needs a link as well as a label.',
            'cta_label.required_with' => 'A button needs a label as well as a link.',
            'cta_url.url' => 'The button link has to be a full https:// address — a mail client has no site to resolve a path against.',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'cta_url' => 'button link',
            'cta_label' => 'button text',
            'sign_off' => 'sign-off',
        ];
    }
}
