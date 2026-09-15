<?php

namespace App\Notifications;

use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * One ad-hoc email, composed in the admin panel rather than by the product.
 *
 * WHAT THIS IS FOR is the mail that has no template because it happens once:
 * a reply to somebody who wrote in, a heads-up to the four people on a beta, a
 * note to a station owner about their own account. Everything else that leaves
 * here is a {@see Notification} with its copy in the code, which is right for
 * anything said more than once and pure friction for anything said once.
 *
 * IT IS NOT AN HTML EDITOR. The body is plain paragraphs, escaped on the way
 * into the template, and the only structure on offer is the headline and the
 * one button. That is deliberate: the value of sending through the GoCast
 * shell is that the result renders in Outlook, and an admin pasting markup
 * into a textarea is the fastest way to lose that without knowing it.
 *
 * The object is per-MESSAGE, not per-recipient. Nothing in here names an
 * address — the greeting is whatever was typed, the same for everybody on the
 * send — so one draft is rendered once per recipient by {@see RawEmail}, which
 * is where the address-specific unsubscribe link is minted.
 */
final class RawEmailDraft
{
    /** The default signature, so the field can be left blank. */
    public const SIGN_OFF = '— The GoCast team';

    /**
     * @param  list<string>  $paragraphs
     */
    public function __construct(
        public readonly string $subject,
        public readonly array $paragraphs,
        public readonly ?string $greeting,
        public readonly ?string $headline,
        public readonly ?string $ctaUrl,
        public readonly ?string $ctaLabel,
        public readonly string $signOff,
        public readonly string $preheader,
        public readonly bool $marketing,
    ) {
        if ($this->paragraphs === []) {
            throw new InvalidArgumentException('An email needs a body.');
        }

        // Both or neither. A URL with no label renders a button reading
        // nothing; a label with no URL renders a button that does nothing.
        if (($this->ctaUrl === null) !== ($this->ctaLabel === null)) {
            throw new InvalidArgumentException('A button needs both a link and a label.');
        }
    }

    /**
     * Build one from the compose form.
     *
     * @param  array<string, mixed>  $fields
     */
    public static function fromArray(array $fields): self
    {
        $paragraphs = self::paragraphs((string) ($fields['body'] ?? ''));

        return new self(
            subject: trim((string) ($fields['subject'] ?? '')),
            paragraphs: $paragraphs,
            greeting: self::optional($fields['greeting'] ?? null),
            headline: self::optional($fields['headline'] ?? null),
            ctaUrl: self::optional($fields['cta_url'] ?? null),
            ctaLabel: self::optional($fields['cta_label'] ?? null),
            signOff: self::optional($fields['sign_off'] ?? null) ?? self::SIGN_OFF,
            // The grey line beside the subject in an inbox list. Left to the
            // opening sentence when it is not written, because the alternative
            // is not "no preheader" — it is the client filling that space with
            // whatever it finds first, which for this template is the wordmark.
            preheader: self::optional($fields['preheader'] ?? null)
                ?? Str::limit($paragraphs[0], 140, ''),
            // Unchecked is the deliberate choice, not the default: see
            // RawEmail for what the flag actually governs.
            marketing: (bool) ($fields['marketing'] ?? false),
        );
    }

    /**
     * Split the textarea into paragraphs on blank lines.
     *
     * A single newline is NOT a paragraph break, so an admin who wraps their
     * own lines at 80 columns — which anybody writing in a textarea does — gets
     * one paragraph rather than six. Windows and old-Mac line endings are
     * folded first so the blank-line test does not depend on which machine the
     * copy was written on.
     *
     * @return list<string>
     */
    private static function paragraphs(string $body): array
    {
        $normalised = str_replace(["\r\n", "\r"], "\n", $body);

        return collect(preg_split('/\n\s*\n/', $normalised) ?: [])
            // Interior newlines collapse to spaces for the same reason: the
            // HTML half would ignore them anyway, and the text half re-wraps.
            ->map(fn (string $block) => trim(preg_replace('/\s+/', ' ', $block) ?? ''))
            ->filter()
            ->values()
            ->all();
    }

    private static function optional(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    /**
     * What both halves of the template read.
     *
     * The unsubscribe URL is the one value that varies by recipient and the
     * one this object does not hold, so it is passed in — null for operational
     * mail, which shows no footer link at all.
     *
     * @return array<string, mixed>
     */
    public function viewData(?string $unsubscribeUrl): array
    {
        return [
            'preheader' => $this->preheader,
            'greeting' => $this->greeting,
            'headline' => $this->headline,
            'paragraphs' => $this->paragraphs,
            'ctaUrl' => $this->ctaUrl,
            'ctaLabel' => $this->ctaLabel,
            'signOff' => $this->signOff,
            'unsubscribeUrl' => $unsubscribeUrl,
            'siteUrl' => 'https://gocast.fm',
        ];
    }

    /**
     * The fields again, in the shape the compose form posts them.
     *
     * Used to carry a previewed draft through to the send as hidden inputs, so
     * what goes out is what was on screen rather than a second reading of the
     * textarea.
     *
     * @return array<string, mixed>
     */
    public function toForm(): array
    {
        return [
            'subject' => $this->subject,
            // Rejoined with the blank lines that made them, so re-parsing this
            // gives back the same paragraphs.
            'body' => implode("\n\n", $this->paragraphs),
            'greeting' => $this->greeting,
            'headline' => $this->headline,
            'cta_url' => $this->ctaUrl,
            'cta_label' => $this->ctaLabel,
            'sign_off' => $this->signOff,
            'preheader' => $this->preheader,
            'marketing' => $this->marketing,
        ];
    }
}
