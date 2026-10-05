<?php

namespace App\Http\Requests;

use App\Models\Station;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates station updates.
 *
 * Slug is system-owned and immutable — it is generated once on creation and
 * never exposed for update. Any "slug" key in the payload is ignored.
 */
class UpdateStationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'genre' => ['nullable', 'string', 'max:255'],
            // IANA identifier, validated against the system tz database
            // so "GMT+2" and other offset spellings are rejected: an
            // offset is only right until the next DST change.
            'timezone' => ['nullable', 'timezone:all'],
            // url:http,https rather than a bare url: the default protocol
            // list is the whole IANA registry, so file://, data:// and
            // view-source:// all pass it — and this value is rendered as an
            // <img src> on a public page.
            'artwork_url' => ['nullable', 'string', 'url:http,https', 'max:2048'],
            // Freeform station links. The cap is a layout bound, not a plan
            // one: past about eight the row on the player stops reading as a
            // set of icons and starts reading as a footer.
            'social_links' => ['nullable', 'array', 'max:'.Station::MAX_SOCIAL_LINKS],
            // array:label,url rejects extra keys outright. Without it any
            // shape at all survives into the JSON column and has to be
            // defended against at every read site forever.
            'social_links.*' => ['array:label,url'],
            // Same protocol allowlist, and for a stronger reason: these become
            // anchors the owner controls on a page listeners trust.
            'social_links.*.url' => ['required', 'string', 'url:http,https', 'max:2048'],
            'social_links.*.label' => ['nullable', 'string', 'max:30'],
            'theme_config' => ['nullable', 'array'],
        ];
    }

    /**
     * Clearing the zone would orphan every show time already published under
     * it: `next_occurrence` goes null, the player's "Next live" line vanishes
     * with no explanation, and the weekly list becomes wall clocks nobody can
     * anchor. The rows have to go first, which is a decision for the owner to
     * make deliberately rather than a side effect of emptying one field.
     *
     * An after-hook rather than a rule on the field: `nullable` tells the
     * validator to stop at the first null, so a closure rule alongside it
     * never runs for the one value this needs to catch.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->has('timezone') || $this->input('timezone') !== null) {
                return;
            }

            $station = $this->route('station');

            if ($station instanceof Station && $station->schedules()->exists()) {
                $validator->errors()->add(
                    'timezone',
                    "Remove the station's show times before clearing its timezone.",
                );
            }

            // Same for the AutoDJ slots, with a sharper consequence: a slot
            // with no zone is unresolvable, and AutoDjProgramme treats the
            // station as unscheduled — every slot silently stops applying.
            if ($station instanceof Station && $station->autodjSlots()->exists()) {
                $validator->errors()->add(
                    'timezone',
                    "Remove the station's AutoDJ slots before clearing its timezone.",
                );
            }
        });
    }
}
