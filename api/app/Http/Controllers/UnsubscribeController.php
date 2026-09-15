<?php

namespace App\Http\Controllers;

use App\Models\EmailSuppression;
use App\Models\Invite;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

/**
 * The opt-out behind the link in every invite email.
 *
 * SIGNED, NOT GUESSABLE. The URL carries the address it unsubscribes, so
 * without a signature anyone could opt out anyone else by editing a query
 * string. `signed` middleware makes the pair (address, link) unforgeable, and
 * the link is generated per send in InviteOffer.
 *
 * TWO STEPS, GET THEN POST, for a reason that bites in production and never
 * in testing: mail clients and security scanners FETCH LINKS. Outlook's Safe
 * Links, corporate filters and preview panes all issue a GET, so a GET that
 * unsubscribed would opt people out who never clicked. So GET only asks, and
 * the write is a POST.
 *
 * That same POST is what the List-Unsubscribe-Post header points at, which is
 * the one-click unsubscribe Gmail and Apple Mail put in their own chrome
 * above the message. It arrives without a session or a CSRF token — hence the
 * exemption in bootstrap/app.php — and it must answer 200 with no redirect,
 * because nothing is looking at the response.
 */
class UnsubscribeController extends Controller
{
    /**
     * Ask. Nothing is written here.
     */
    public function show(Request $request): View
    {
        $email = (string) $request->query('email', '');

        return view('unsubscribe', [
            'email' => $email,
            'done' => EmailSuppression::suppresses($email),
            // The full signed URL, reused as the form's action so the POST
            // carries the same signature this GET was validated against.
            'action' => $request->fullUrl(),
        ]);
    }

    /**
     * Record it.
     *
     * Returns the page for a person and a bare 200 for a one-click header,
     * distinguished by whether the request looks like a browser navigation.
     * A redirect would be wrong for the header case: the sending client
     * follows nothing and reads nothing.
     */
    public function store(Request $request): View|Response
    {
        $email = (string) $request->query('email', '');

        if ($email === '') {
            abort(400);
        }

        // Attributed to the invite that carried the link when we can still
        // find it, so the admin page can show which send prompted the no.
        $invite = ($code = $request->query('invite'))
            ? Invite::where('code', $code)->first()
            : null;

        EmailSuppression::record($email, $invite);

        // One-click: RFC 8058 says the client POSTs `List-Unsubscribe=One-Click`
        // as a form body and ignores everything but the status code.
        if ($request->input('List-Unsubscribe') === 'One-Click') {
            return response('', 200);
        }

        return view('unsubscribe', [
            'email' => $email,
            'done' => true,
            'action' => $request->fullUrl(),
        ]);
    }
}
