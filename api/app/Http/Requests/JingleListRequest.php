<?php

namespace App\Http\Requests;

use App\Models\JingleList;
use App\Models\Station;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Creates or edits a jingle list and its one rule:
 *
 *   "Play a [pick] jingle from [name] [how often], [when]."
 *
 * Every field is optional on update (PATCH) and the rule is checked as a
 * whole against what the list will hold afterwards, so a client can change
 * one field at a time. On create only `name` is required; the rest default
 * to "a random jingle every 4 songs, all day".
 */
class JingleListRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:60'],
            'enabled' => ['sometimes', 'boolean'],
            'pick' => ['sometimes', Rule::in(JingleList::PICKS)],
            'pinned_track_id' => ['sometimes', 'nullable', 'ulid'],
            'frequency' => ['sometimes', Rule::in(JingleList::FREQUENCIES)],
            // Up to twelve hours, and up to fifty songs: past that the rule
            // is "hardly ever", which is what switching it off is for.
            'every_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:720'],
            'every_songs' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:50'],
            'times' => ['sometimes', 'nullable', 'array', 'max:48'],
            'times.*' => ['date_format:H:i', 'distinct'],
            'exact' => ['sometimes', 'boolean'],
            'days' => ['sometimes', 'nullable', 'array', 'min:1', 'max:7'],
            'days.*' => ['integer', 'between:0,6', 'distinct'],
            'from_time' => ['sometimes', 'nullable', 'date_format:H:i'],
            'to_time' => ['sometimes', 'nullable', 'date_format:H:i'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'times.*.date_format' => 'Times look like 08:00.',
            'times.*.distinct' => 'That time is already in the list.',
            'from_time.date_format' => 'Times look like 07:00.',
            'to_time.date_format' => 'Times look like 10:00.',
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $rule = $this->ruleAfterSave();

                $required = [
                    JingleList::FREQUENCY_MINUTES => ['every_minutes', 'How many minutes between jingles?'],
                    JingleList::FREQUENCY_SONGS => ['every_songs', 'How many songs between jingles?'],
                    JingleList::FREQUENCY_TIMES => ['times', 'Add at least one time.'],
                ][$rule['frequency']];

                if (empty($rule[$required[0]])) {
                    $validator->errors()->add($required[0], $required[1]);
                }

                if (($rule['from_time'] === null) !== ($rule['to_time'] === null)) {
                    $validator->errors()->add('to_time', 'Set both a start and an end time, or neither.');
                } elseif ($rule['from_time'] !== null && substr($rule['from_time'], 0, 5) === substr($rule['to_time'], 0, 5)) {
                    $validator->errors()->add('to_time', 'The end time must differ from the start.');
                }

                if ($rule['pick'] === JingleList::PICK_SINGLE && $rule['pinned_track_id'] !== null) {
                    $list = $this->route('jingleList');
                    $belongs = $list instanceof JingleList
                        && $list->tracks()->whereKey($rule['pinned_track_id'])->exists();

                    if (! $belongs) {
                        $validator->errors()->add('pinned_track_id', 'Pick one of this list’s jingles.');
                    }
                }

                $clocked = $rule['frequency'] === JingleList::FREQUENCY_TIMES
                    || $rule['days'] !== null
                    || $rule['from_time'] !== null;

                if ($clocked && $this->station()->timezone === null) {
                    $validator->errors()->add('frequency', 'Set the station timezone in Settings before using times or days.');
                }
            },
        ];
    }

    /**
     * The rule fields as they will be stored: the request's values over the
     * list's current ones (or the defaults, on create).
     *
     * @return array<string, mixed>
     */
    public function ruleAfterSave(): array
    {
        $list = $this->route('jingleList');
        $current = $list instanceof JingleList ? $list : new JingleList;

        $fields = ['pick', 'pinned_track_id', 'frequency', 'every_minutes', 'every_songs', 'times', 'days', 'from_time', 'to_time'];
        $rule = [];

        foreach ($fields as $field) {
            $rule[$field] = $this->has($field) ? $this->input($field) : $current->getAttribute($field);
        }

        if (is_array($rule['times'])) {
            $rule['times'] = array_values(array_unique($rule['times']));
            sort($rule['times']);
        }

        if (is_array($rule['days'])) {
            $rule['days'] = array_values(array_unique(array_map('intval', $rule['days'])));
            sort($rule['days']);
        }

        return $rule;
    }

    private function station(): Station
    {
        $list = $this->route('jingleList');

        return $list instanceof JingleList ? $list->station : $this->route('station');
    }
}
