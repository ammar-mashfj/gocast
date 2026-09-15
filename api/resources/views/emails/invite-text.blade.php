{{--
    The text/plain half of the invite, from the design's own plain-text
    version. Not optional: a cold HTML-only email is a spam signal, and this
    is what a screen reader and a plain-text client actually get.

    Kept in step with emails/invite.blade.php by hand. There is no way around
    that — the two say the same thing in two formats — so the rule is that a
    change to one is a change to both, and the test asserts the link and the
    plan line appear in each.

    EVERY INTERPOLATION HERE IS {!! !!}, NOT {{ }}. This part is text/plain:
    HTML escaping has nothing to escape for and actively corrupts what it
    touches — `{!! $unsubscribeUrl !!}` turns the `&` between query parameters
    into `&amp;`, which breaks the signature the moment somebody copies the
    line out of a plain-text client. There is no injection risk to trade
    against that: the output is never parsed as markup.
--}}
GoCast.fm

{!! $greeting !!}
@if ($note)

{!! $note !!}
@endif

We're inviting a small group of DJs onto GoCast and we'd like you to be
one of them.

It's your own radio station, on air 24/7. Upload your tracks and it keeps
playing around the clock — your sound reaching listeners while you're
asleep, working, or on the road. When you want to go live, you open a tab
in your browser and you're broadcasting. Nothing to download, nothing to
install.

Claim your invite: {!! $inviteUrl !!}
{!! $planCaption !!}@if ($deadline) {!! $deadline !!}@endif


If anything's confusing or missing once you're in, tell us — that's the
only thing we want back.

— The GoCast team

--
gocast.fm
Unsubscribe: {!! $unsubscribeUrl !!}
