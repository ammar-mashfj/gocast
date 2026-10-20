<?php

namespace App\Http\Requests\Concerns;

/**
 * Accept the old names of renamed timezones and store the current one.
 *
 * Chrome (V8's ICU) still reports and lists the pre-rename names —
 * Asia/Calcutta, Europe/Kiev, America/Buenos_Aires — while PHP's
 * `timezone:all` only knows the current ones. Without this, a host in India
 * could never save a timezone from the browser: the default the dialog
 * offered was refused, and the right name wasn't in its list.
 */
trait NormalizesTimezone
{
    /** Every zone Intl.supportedValuesOf('timeZone') returns that PHP does not (checked 2026-10-18). */
    public const TIMEZONE_ALIASES = [
        'Africa/Asmera' => 'Africa/Asmara',
        'America/Buenos_Aires' => 'America/Argentina/Buenos_Aires',
        'America/Catamarca' => 'America/Argentina/Catamarca',
        'America/Coral_Harbour' => 'America/Atikokan',
        'America/Cordoba' => 'America/Argentina/Cordoba',
        'America/Godthab' => 'America/Nuuk',
        'America/Indianapolis' => 'America/Indiana/Indianapolis',
        'America/Jujuy' => 'America/Argentina/Jujuy',
        'America/Louisville' => 'America/Kentucky/Louisville',
        'America/Mendoza' => 'America/Argentina/Mendoza',
        'Asia/Calcutta' => 'Asia/Kolkata',
        'Asia/Katmandu' => 'Asia/Kathmandu',
        'Asia/Rangoon' => 'Asia/Yangon',
        'Asia/Saigon' => 'Asia/Ho_Chi_Minh',
        'Atlantic/Faeroe' => 'Atlantic/Faroe',
        'Europe/Kiev' => 'Europe/Kyiv',
        'Pacific/Enderbury' => 'Pacific/Kanton',
        'Pacific/Ponape' => 'Pacific/Pohnpei',
        'Pacific/Truk' => 'Pacific/Chuuk',
    ];

    protected function prepareForValidation(): void
    {
        $timezone = $this->input('timezone');

        if (is_string($timezone) && isset(self::TIMEZONE_ALIASES[$timezone])) {
            $this->merge(['timezone' => self::TIMEZONE_ALIASES[$timezone]]);
        }
    }
}
