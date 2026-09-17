/*
 * External-encoder ingest routing.
 *
 * WHY THIS IS NOT AN nginx LOCATION BLOCK. Every libshout client — BUTT,
 * Mixxx, RadioDJ — opens its audio connection with:
 *
 *     SOURCE /my-station HTTP/1.0
 *
 * libshout only sends `PUT` when the server advertised it in an `Allow:`
 * header during an OPTIONS probe (proto_http.c:106), and harbor registers no
 * OPTIONS handler, so it never does. `SOURCE` is not an HTTP method, the
 * request is HTTP/1.0, and it carries neither Content-Length nor
 * Transfer-Encoding — so nginx's http module cannot frame the body, concludes
 * there is none, and proxies a request that succeeds and carries silence.
 * That is the worst possible failure: the DJ's encoder says "connected".
 *
 * So ingest is routed at the TCP layer. This script reads just far enough into
 * the connection to learn which station it is for, points $station_upstream at
 * that station's container, and gets out of the way. The bytes it read are
 * forwarded to harbor untouched, and harbor — not this file — authenticates
 * the broadcaster.
 *
 * -------------------------------------------------------------------------
 * WHAT LIBSHOUT ACTUALLY DOES
 *
 * Captured from libshout 2.4.1 on 2026-09-15 by pointing it at a logging
 * socket. ONE broadcast is six TCP connections, in this order:
 *
 *   1. OPTIONS * HTTP/1.1                  <- PUT-capability probe. No mount.
 *   2. SOURCE /test HTTP/1.0               <- no credentials; expects a 401
 *   3. SOURCE /test HTTP/1.0 + Basic auth  <- the audio, for the whole show
 *   4. OPTIONS * HTTP/1.1                  <- probes again before metadata
 *   5. POST /admin/metadata HTTP/1.1       <- mount in the FORM BODY, no auth
 *   6. POST /admin/metadata + Basic auth   <- the title, per track change
 *
 * Three consequences, each of which was a bug in the first version of this
 * file:
 *
 *   • (1) AND (4) MUST BE ANSWERED. They carry no mount, so they cannot be
 *     routed to a station — but closing them is not a neutral act. libshout
 *     treats a reset on the probe as fatal for the WHOLE connect:
 *
 *         shout_open() failed: err=Socket error
 *
 *     and never sends (2). Any HTTP response at all is enough; a 400 works.
 *     They are answered by the loopback responder below.
 *
 *   • (2) IS SUPPOSED TO FAIL. Harbor answers it 401 with a WWW-Authenticate
 *     header, which is the signal libshout needs to open (3) with credentials.
 *
 *     It costs us nothing, and that is worth stating precisely because the
 *     obvious guess is wrong: harbor answers this one ITSELF and never calls
 *     the auth callback, so it does not reach HarborAuthController, does not
 *     log a refusal, and does not move `gocast_harbor_auth_total`. Verified
 *     against the 2.4.5 image — a credential-less SOURCE returns 401 with the
 *     auth function uncalled, while the same request carrying `Authorization:
 *     Basic` invokes it once.
 *
 *     So `refused{method="none"}` really is what IngestMetrics says it is,
 *     mostly scanners, and a spike in it is worth looking at rather than
 *     discounting as libshout being chatty.
 *
 *   • (5) AND (6) PUT THE MOUNT IN A FORM BODY, not the query string — and
 *     harbor does not read form bodies. It parses `mode`, `mount` and `song`
 *     out of the QUERY ARGS only, so libshout's own metadata request comes
 *     back from a stock harbor as:
 *
 *         HTTP/1.0 400 Bad Request ... <p>unrecognised command</p>
 *
 *     Both halves of that are ours to fix and neither is optional: a router
 *     that reads only the request line cannot even find the mount, and one
 *     that finds it and forwards the POST verbatim gets a 400. So metadata
 *     takes a detour through an HTTP hop in this container that turns the POST
 *     into the GET harbor understands. Without it, a DJ running a playlist
 *     shows listeners whatever was up when they connected, for the whole show
 *     — which is the exact bug `icy=true` was added to the template to fix,
 *     reappearing one layer down.
 */

/*
 * The station slug, and a SECURITY BOUNDARY rather than tidiness: whatever
 * this captures becomes a hostname this container dials. Anchored, and limited
 * to the same charset Station::generateUniqueSlug() produces and
 * gocast-stream.conf already matches on.
 */
var SLUG = '[a-z0-9][a-z0-9-]{0,62}';

/*
 * Audio. Any uppercase verb, because harbor accepts SOURCE (Icecast 2 via
 * libshout), PUT (libshout where the server advertised it), POST, and the
 * Icecast 1 / ICY spellings — and we would rather forward one harbor refuses
 * than refuse one harbor would have accepted.
 *
 * `ICE/1.0` is Icecast 1's protocol line and appears where HTTP/1.x would.
 */
var AUDIO = new RegExp('^[A-Z]+ /(' + SLUG + ')/? (?:HTTP/1\\.[01]|ICE/1\\.0)');

/* The capability probe. No mount, by definition — see the header. */
var OPTIONS = /^OPTIONS [^\s]+ HTTP\/1\.[01]/;

/* A metadata update, in either of the two shapes libshout uses. */
var META_REQUEST = /^(?:GET|POST) \/admin\/metadata(?:\?|\s)/i;

/*
 * The mount inside a metadata request, wherever it is: the query string on the
 * GET form, the form body on the POST form. The leading slash may arrive as
 * `%2F`, `%2f` or literally.
 *
 * Requiring a `?`, `&` or newline in front is not decoration. Without it this
 * could in principle match inside the base64 of an Authorization header, which
 * is attacker-chosen text one line above — and the capture becomes a hostname
 * we dial. None of `?`, `&` or a newline can appear in base64.
 *
 * NO `i` FLAG, and the two spellings of the slash are written out instead.
 * The flag was here to accept `%2F` as well as `%2f`, but a flag is not
 * selective: it also applied to the capture, so SLUG's `[a-z0-9]` matched
 * `MyStation` and the "same charset generateUniqueSlug() produces" claim above
 * quietly stopped being true of the one group that becomes a hostname. Docker
 * DNS folds case so nothing broke, but an invariant the comment leans on
 * should not depend on that. Lowercase `mount=` is also what harbor itself
 * parses, so matching `Mount=` only ever routed a request harbor would refuse.
 */
var META_MOUNT = new RegExp('[?&\\r\\n]mount=(?:%2[fF]|/)(' + SLUG + ')(?:[&\\s"]|$)');

/* Harbor's port inside every station container (LIQUIDSOAP_HARBOR_INPUT_PORT). */
var HARBOR_PORT = 8090;

/*
 * Where metadata updates go: the rewriting HTTP hop in this container's own
 * http block. It reads the form body, works out the station itself, and
 * reissues the update as the GET harbor actually parses. See nginx.conf.
 *
 * The stream block could not do that rewrite: it splices bytes and has no
 * HTTP parser, and a `js_filter` that rebuilt the request would have to sit in
 * front of the audio connections too — every megabyte of MP3 copied through a
 * JavaScript VM to serve a few hundred bytes of titles.
 */
var META_UPSTREAM = '127.0.0.1:8093';

/*
 * Where the OPTIONS probes go: the loopback responder in this container's own
 * http block, which answers 200 with an `Allow:` that deliberately omits PUT.
 *
 * Omitting PUT is the point, not an oversight. Harbor accepts PUT, but SOURCE
 * is the path that is verified end to end here, and PUT would bring HTTP/1.1
 * chunked framing into a connection we are splicing blind. Advertising no PUT
 * keeps every libshout client on the one shape we have tested.
 */
var OPTIONS_UPSTREAM = '127.0.0.1:8092';

/*
 * Give up rather than buffer forever. The largest thing we ever need to read
 * is a metadata POST — headers plus a form body of a few hundred bytes — and
 * preread_buffer_size caps what nginx would hand us anyway.
 */
var MAX_PREREAD = 4096;

/* resolve() returns one of these, or an upstream string. */
var INCOMPLETE = null;
var UNROUTABLE = false;

/**
 * The metadata rewriter, in the HTTP block.
 *
 * Turns libshout's `POST /admin/metadata` with a form body into the
 * `GET /admin/metadata?<args>` harbor parses, aimed at the right station's
 * container. Also handles the GET form, which some clients send and which only
 * needs routing.
 *
 * The Authorization header rides along untouched (see nginx.conf): harbor
 * authenticates this request as well as the audio one, which is what stops
 * anyone on the internet writing now-playing text onto somebody else's
 * station through the same open port. Verified — a wrong key gets a 401 here
 * exactly as it does on the audio path.
 */
function metadata(r) {
    /*
     * njs reads the client body before a js_content handler runs, so this is
     * populated for the POST form and empty for the GET form. `args` is
     * everything after the `?` on the request line.
     */
    var payload = r.requestText || r.variables.args || '';

    var m = ('&' + payload).match(META_MOUNT);
    if (!m) {
        r.error('metadata: no routable mount in ' + payload.length + ' bytes');
        r.return(400, 'no mount\n');
        return;
    }

    r.variables.meta_upstream = 'gocast-liquidsoap-' + m[1] + ':' + HARBOR_PORT;
    r.variables.meta_args = safeArgs(payload);

    /*
     * Named location rather than a subrequest: this IS the request, reissued,
     * and the client should see whatever harbor answers — including its 401,
     * which is the signal libshout needs to retry with credentials.
     */
    r.internalRedirect('@harbor_metadata');
}

/*
 * Make a form body safe to paste into a request line.
 *
 * `meta_args` lands in `proxy_pass .../admin/metadata?$meta_args`, and nginx
 * does NOT escape a variable it interpolates there — whatever this returns is
 * written into the upstream request line verbatim. The body is client-supplied
 * and only ever checked for containing a routable `mount=`, so it cannot go
 * through unexamined.
 *
 * Three things go wrong with the raw value, in ascending order of how much
 * they matter:
 *
 *   • A literal space ends the request line early, so harbor sees a truncated
 *     query and answers `unrecognised command` — the frozen now-playing title
 *     this whole hop exists to prevent, back again.
 *   • A `#` makes everything after it a fragment, silently dropping `song=`
 *     when the title happens to contain one.
 *   • A CR or LF would put a newline into the request line we build, which is
 *     request smuggling against harbor rather than a display bug.
 *
 * libshout url-encodes properly and never trips any of these; RadioDJ, custom
 * scripts and the hand-rolled GET form are not bound by that promise.
 *
 * A BLOCKLIST, not an allowlist, and that is the careful choice rather than
 * the lazy one. An allowlist has to re-encode everything it does not
 * recognise, which means encoding non-ASCII — and getting that right needs the
 * UTF-8 BYTES, while charCodeAt() hands back UTF-16 code units. Encoding `é`
 * that way yields `%e9` (latin-1) where `%C3%A9` is correct, so a title in any
 * non-English language would arrive corrupted. Escaping only the characters
 * that actually break the request line leaves every byte we have no reason to
 * touch exactly as the client sent it, which is also what a stock Icecast
 * would pass through.
 *
 * `%` is therefore untouched too: an already-encoded `%20` stays `%20` instead
 * of being double-encoded into `%2520`.
 */
function safeArgs(payload) {
    return payload.replace(/[\x00-\x20\x7f#]/g, function (c) {
        var code = c.charCodeAt(0);

        return code < 16 ? '%0' + code.toString(16) : '%' + code.toString(16);
    });
}

function route(s) {
    /*
     * Per-connection, NOT module-level.
     *
     * nginx's own `detect_http` njs example keeps its buffer in a variable
     * declared inside the handler for exactly this reason: one worker serves
     * many connections concurrently, and a shared buffer interleaves two
     * broadcasters' requests into a slug that matches neither — or, worse,
     * into one that matches somebody else's station.
     */
    var buf = '';

    s.on('upload', function (data, flags) {
        /*
         * A CHUNK, not the accumulated buffer. njs delivers what arrived; we
         * accumulate, because a request can straddle segments — and for the
         * metadata POST it routinely does, since the mount is in a body that
         * may arrive after the headers.
         */
        buf += data;

        var upstream = resolve(buf);

        if (upstream !== INCOMPLETE && upstream !== UNROUTABLE) {
            s.variables.station_upstream = upstream;

            /*
             * Hand the connection to proxy_pass. Everything buffered here is
             * forwarded, so harbor sees the request byte for byte — including
             * the Authorization header it authenticates on.
             */
            return s.done();
        }

        if (upstream === UNROUTABLE) {
            return refuse(s, 'unroutable: ' + firstLine(buf).substring(0, 64));
        }

        if (buf.length > MAX_PREREAD) {
            return refuse(s, 'no mount found in ' + buf.length + ' bytes');
        }

        if (flags.last) {
            return refuse(s, 'client finished without sending a routable request');
        }

        /* Wait for more. preread_timeout is the backstop. */
    });
}

function firstLine(buf) {
    var eol = buf.indexOf('\n');
    return eol < 0 ? buf : buf.substring(0, eol);
}

/**
 * Where should this connection go, given everything read so far?
 *
 * Returns an upstream, INCOMPLETE (ask again when more arrives), or
 * UNROUTABLE (nothing more will help).
 */
function resolve(buf) {
    if (buf.indexOf('\n') < 0) {
        return INCOMPLETE;
    }

    var line = firstLine(buf);

    var audio = line.match(AUDIO);
    if (audio) {
        return 'gocast-liquidsoap-' + audio[1] + ':' + HARBOR_PORT;
    }

    if (OPTIONS.test(line)) {
        return OPTIONS_UPSTREAM;
    }

    if (META_REQUEST.test(line)) {
        /*
         * Handed off whole, body and all — the hop parses it properly rather
         * than this regex having to. We do NOT need the mount here, which is
         * the point: the POST form carries it in a body that may not have
         * arrived yet, and waiting for it would mean reimplementing
         * Content-Length framing in a preread handler.
         */
        return META_UPSTREAM;
    }

    return UNROUTABLE;
}

/*
 * Refuse.
 *
 * The connection is closed without a word, and that is a limitation rather
 * than a choice: `s.send()` in a preread handler answers
 *
 *     cannot send buffer in this handler
 *
 * (verified against njs 0.9.6), and only js_filter may write downstream —
 * which runs after the upstream has been chosen, so it cannot be the thing
 * that chooses it.
 *
 * That costs less than it looks like, because nothing a DJ does wrong arrives
 * here any more. A wrong password reaches harbor and comes back as a real 401.
 * A switched-off station fails at DNS. The capability probe is answered. What
 * is left is traffic that is not the Icecast source protocol at all — a port
 * scanner, a browser, a TLS handshake — none of which is reading our error
 * messages. The log line is for us.
 */
function refuse(s, why) {
    s.error('ingest refused (' + why + ')');
    s.deny();
}

export default { route, metadata };
