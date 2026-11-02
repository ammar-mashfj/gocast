<?php

use App\Console\Commands\RefreshDisposableDomains;
use App\Services\DisposableEmail;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

/*
| email:refresh-disposable replaces the throwaway-domain list with the
| maintained one plus ours, and only with a download that looks whole.
*/

const DISPOSABLE_SOURCE = 'https://lists.test/disposable_email_blocklist.conf';

beforeEach(function () {
    Sleep::fake();
    $this->target = sys_get_temp_dir().'/gocast-disposable-'.uniqid().'.txt';

    config([
        'security.disposable_domains_source' => DISPOSABLE_SOURCE,
        'security.disposable_domains_list' => $this->target,
    ]);
});

afterEach(function () {
    @unlink($this->target);
});

/** The bundled list is ~10,000 domains; a whole download is at least that. */
const WHOLE_DOWNLOAD = 12000;

/** A download of $count made-up domains. */
function maintainedList(int $count): string
{
    return implode("\n", array_map(fn (int $i) => "throwaway-{$i}.example", range(1, $count)))."\n";
}

it('writes the download merged with our own additions', function () {
    Http::fake([DISPOSABLE_SOURCE => Http::response(maintainedList(WHOLE_DOWNLOAD))]);

    $this->artisan('email:refresh-disposable')->assertSuccessful();

    $written = DisposableEmail::readList($this->target);
    $ours = array_keys(DisposableEmail::readList(DisposableEmail::oursPath()));

    expect($ours)->toContain('fldubai.com')
        ->and(array_diff($ours, array_keys($written)))->toBe([])
        ->and($written)->toHaveKey('throwaway-1.example')
        ->and(count($written))->toBe(WHOLE_DOWNLOAD + count($ours));
});

it('makes the refreshed list the one sign-ups are checked against', function () {
    Http::fake([DISPOSABLE_SOURCE => Http::response(maintainedList(WHOLE_DOWNLOAD))]);

    expect(DisposableEmail::isListedDomain('throwaway-7.example'))->toBeFalse();

    $this->artisan('email:refresh-disposable')->assertSuccessful();

    expect(DisposableEmail::isListedDomain('throwaway-7.example'))->toBeTrue();
});

it('keeps the current list when the download is too small', function () {
    file_put_contents($this->target, "kept.example\n");
    Http::fake([DISPOSABLE_SOURCE => Http::response(maintainedList(40))]);

    $this->artisan('email:refresh-disposable')->assertFailed();

    expect(file_get_contents($this->target))->toBe("kept.example\n");
});

it('keeps the current list when the download is an error page or fails', function (mixed $response) {
    file_put_contents($this->target, "kept.example\n");
    Http::fake([DISPOSABLE_SOURCE => $response]);

    $this->artisan('email:refresh-disposable')->assertFailed();

    expect(file_get_contents($this->target))->toBe("kept.example\n");
})->with([
    'HTML served as 200' => [fn () => Http::response('<html><body>'.str_repeat('<p>rate limited</p>', 9000).'</body></html>')],
    'HTTP 500' => [fn () => Http::response('', 500)],
    'no connection' => [fn () => fn () => throw new ConnectionException('unreachable')],
]);

it('refuses a list far shorter than the one on file', function () {
    file_put_contents($this->target, maintainedList(RefreshDisposableDomains::MIN_DOMAINS * 3));
    $before = file_get_contents($this->target);
    Http::fake([DISPOSABLE_SOURCE => Http::response(maintainedList(RefreshDisposableDomains::MIN_DOMAINS))]);

    $this->artisan('email:refresh-disposable')->assertFailed();

    expect(file_get_contents($this->target))->toBe($before);
});
