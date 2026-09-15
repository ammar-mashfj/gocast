{{--
    The text/plain half of an admin-composed email.

    Not optional: a cold HTML-only email is a spam signal, and this is what a
    screen reader and a plain-text client actually get.

    Unlike emails/invite-text.blade.php this one cannot drift from its HTML
    sibling, because both are rendered from the same RawEmailDraft and neither
    carries any copy of its own. The only thing to keep in step is which
    OPTIONAL pieces each half shows — headline, button, unsubscribe footer —
    and the test asserts that for each.

    EVERY INTERPOLATION HERE IS {!! !!}, NOT {{ }}. This part is text/plain:
    HTML escaping has nothing to escape for and actively corrupts what it
    touches — `{!! $unsubscribeUrl !!}` turns the `&` between query parameters
    into `&amp;`, which breaks the signature the moment somebody copies the
    line out of a plain-text client. There is no injection risk to trade
    against that: the output is never parsed as markup.
--}}
GoCast.fm
@if ($greeting)

{!! $greeting !!}
@endif
@if ($headline)

{!! $headline !!}
@endif
@foreach ($paragraphs as $paragraph)

{!! $paragraph !!}
@endforeach
@if ($ctaUrl)

{!! $ctaLabel !!}: {!! $ctaUrl !!}
@endif

{!! $signOff !!}

--
gocast.fm
@if ($unsubscribeUrl)
Unsubscribe: {!! $unsubscribeUrl !!}
@endif
