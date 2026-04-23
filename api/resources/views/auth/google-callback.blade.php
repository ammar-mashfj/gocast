<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Signing you in…</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
    <style>
        html, body { margin: 0; height: 100%; background: #08080d; color: #fff; font-family: system-ui, -apple-system, sans-serif; }
        .wrap { display: flex; height: 100%; align-items: center; justify-content: center; }
        p { font-size: 14px; opacity: .8; }
    </style>
</head>
<body>
    <div class="wrap"><p>Finishing sign-in…</p></div>
    <script>
    (function () {
        // Payload is server-side rendered — never interpolate user input into
        // JS. Blade's json directive escapes for JS-literal context, and the
        // target origin comes from config, never from query params.
        var payload = @json($payload);
        var targetOrigin = @json($frontendOrigin);

        // Popup path: report success (or error) to the opener via postMessage
        // with a strict target origin so the browser refuses delivery if the
        // opener's origin doesn't match. The auth token itself is already set
        // as an HttpOnly cookie by the API response. Then close.
        if (window.opener && !window.opener.closed) {
            try {
                window.opener.postMessage(payload, targetOrigin);
            } catch (e) {
                // If postMessage fails (e.g. opener navigated away) we fall
                // through to the redirect path below so the user isn't stranded.
            }
            window.close();
            // If close() is blocked (rare but possible when popup wasn't
            // script-opened), leave the user on a polite static page.
            return;
        }

        // Full-page fallback: no opener window, so navigate the tab to the
        // SPA's existing /auth/callback route which already handles the
        // `?authenticated=1` and `?error=` contract.
        var qs = payload.authenticated
            ? '?authenticated=1'
            : '?error=' + encodeURIComponent(payload.error || 'google_auth_failed');
        window.location.replace(targetOrigin + '/auth/callback' + qs);
    })();
    </script>
</body>
</html>
