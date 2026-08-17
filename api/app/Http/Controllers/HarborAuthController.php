<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Services\BroadcastTokenService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Liquidsoap harbor auth callback.
 *
 * A station's container calls this once per connection attempt, from the
 * `auth` function in its rendered .liq:
 *
 *   { slug, user, password, address }
 *
 * Returns 200 to allow, anything else to refuse. The container fails closed,
 * so a timeout or a 500 here rejects the broadcaster rather than admitting
 * them — this is the only thing standing between the open ingest port and
 * anyone who can reach it.
 *
 * The password is the short-lived, station-scoped token minted by
 * BroadcastTokenController: bound to {user, station}, MAC-signed with APP_KEY,
 * and valid for about a minute. A leaked URL grants nothing lasting.
 *
 * Unlike the MediaMTX webhook this replaced, there is no station-start logic
 * here. Harbor lives *inside* the station container, so a broadcaster who can
 * reach it has already proven the container is up — and the studio starts the
 * station (through the plan-limit checks) before it ever opens the socket.
 */
class HarborAuthController extends Controller
{
    public function __invoke(Request $request, BroadcastTokenService $tokens): Response
    {
        $data = $request->validate([
            'slug' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:2048'],
            'user' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);

        $slug = $data['slug'];
        $token = (string) ($data['password'] ?? '');

        if ($token === '') {
            return $this->refuse($slug, $data, 'no credential supplied');
        }

        if ($tokens->verify($token, $slug) === null) {
            return $this->refuse($slug, $data, 'invalid or expired token');
        }

        // Tokens are self-contained — no DB read on verify — so one minted
        // moments before the station was deleted still MAC-validates. Confirm
        // the station is really there before admitting a publisher.
        if (! Station::where('slug', $slug)->exists()) {
            return $this->refuse($slug, $data, 'unknown station');
        }

        return response('', Response::HTTP_OK);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function refuse(string $slug, array $data, string $reason): Response
    {
        // Info, not warning: a broadcaster whose token expired mid-reconnect
        // trips this routinely and it is self-correcting.
        Log::info('Harbor auth refused a publisher', [
            'station' => $slug,
            'user' => $data['user'] ?? null,
            'address' => $data['address'] ?? null,
            'reason' => $reason,
        ]);

        return response($reason, Response::HTTP_FORBIDDEN);
    }
}
