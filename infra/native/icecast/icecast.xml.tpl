<?xml version="1.0"?>
<!--
    GoCast Icecast 2 config — NATIVE (Debian/Ubuntu icecast2 package).

    Rendered by setup-native.sh into /etc/icecast2/icecast.xml. The <paths>
    block differs. The Alpine package installs under /usr/share/icecast and
    logs to /var/log/icecast; Debian's icecast2 package uses
    /usr/share/icecast2 and /var/log/icecast2. Pointing at the Alpine paths
    on Ubuntu makes Icecast start, serve audio correctly, and 404 its own
    status page — which is a confusing way to discover the mistake.

    Render with the same envsubst call the container entrypoint uses:

      envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_ADMIN_USER} \
                ${ICECAST_ADMIN_PASSWORD} ${ICECAST_MAX_SOURCES} \
                ${ICECAST_MAX_CLIENTS} ${ICECAST_CALLBACK_USER} \
                ${ICECAST_CALLBACK_PASSWORD}' \
        < infra/native/icecast/icecast.xml.tpl \
        | sudo tee /etc/icecast2/icecast.xml

    setup-native.sh does this for you. Passwords MUST match the ones in
    api/.env — a mismatch means every station gets 401 on SOURCE connect and
    the symptom is "station starts, then goes unhealthy 45 seconds later".

    WRITTEN FOR ICECAST 2.5 (prod runs 2.5.0). Source logins are decided per
    mount by an <authentication> role stack, not by a global source-password,
    because two kinds of source share this server: Pro stations' Liquidsoap
    containers (fixed user `source`) and Free stations arriving through the
    relay (user = slug, password = a broadcast token Laravel checks). See
    docs/RELAY-SERVICE-PLAN.md §3; every rule below was verified against
    2.5.0 in the relay lab.
-->
<icecast>
    <location>Earth</location>
    <admin>hello@gocast.fm</admin>

    <limits>
        <!-- Every listener AND every source. Free listeners play this
             server directly (no HLS on the relay path), so it is sized for
             the audience, not the stations: ICECAST_MAX_CLIENTS in
             api/.env, default 5000. -->
        <clients>${ICECAST_MAX_CLIENTS}</clients>
        <!-- Raised from the stock 2: one SOURCE is held per running
             station container, not per live broadcaster. ICECAST_MAX_SOURCES
             in api/.env (default 150); stations:sync-listeners warns at 80%.
             It was 50 until 2026-10-10, when the 51st station was refused. -->
        <sources>${ICECAST_MAX_SOURCES}</sources>
        <queue-size>524288</queue-size>
        <client-timeout>30</client-timeout>
        <header-timeout>15</header-timeout>
        <source-timeout>10</source-timeout>
        <burst-on-connect>1</burst-on-connect>
        <burst-size>65535</burst-size>
    </limits>

    <!-- Global: the admin account only (Laravel's listener counts,
         killsource, metadata). Source logins are per mount, below. -->
    <authentication>
        <admin-user>${ICECAST_ADMIN_USER}</admin-user>
        <admin-password>${ICECAST_ADMIN_PASSWORD}</admin-password>
    </authentication>

    <!-- The public listener hostname, not the machine's. Icecast writes this
         into the URLs in status.xsl and in the YP directory listing. -->
    <hostname>__ICECAST_HOST__</hostname>

    <!--
        Bound on all interfaces, NOT 127.0.0.1.

        Two different clients reach Icecast and they arrive on different
        addresses: host nginx connects over loopback, and each station's
        Liquidsoap container connects as a SOURCE via
        `host.docker.internal`, which the `add-host host-gateway` flag
        resolves to
        the docker0 gateway (172.17.0.1). A loopback-only listener is
        invisible to every container, and the failure looks like Icecast
        refusing connections for no reason.

        Public exposure is closed at the firewall instead — see the ufw
        rules in setup-native.sh, which allow this port only from loopback
        and the two Docker CIDRs. Listeners reach Icecast through nginx on
        443, never here.
    -->
    <listen-socket>
        <port>__ICECAST_PORT__</port>
    </listen-socket>

    <http-headers>
        <header name="Access-Control-Allow-Origin" value="*" />
    </http-headers>

    <mount type="default">
        <hidden>0</hidden>
        <public>0</public>
        <!-- Burst: what a NEW listener is sent at once on connect. Chrome
             will not start an MP3 stream until it holds ~128 KB, so with
             16 KB a Chrome listener (most of them) pressed play and waited
             8 s of silence; at 128 KB (8 s of 128k audio) it starts in ~1 s.
             Measured on 2.5.0 (relay lab): Chrome 8.0 s → 1.0 s, Firefox
             2.0 → 1.0, WebKit ~1 both. The cost: every listener starts ~8 s
             behind the broadcaster — where Chrome ended up anyway. It does
             not make listeners drift later across fallback switches (buffer
             depth held at ~2.4 s over 20 drops).

             Queue: how far a slow listener may lag before Icecast drops
             them. It must be larger than the burst. -->
        <burst-size>131072</burst-size>
        <queue-size>262144</queue-size>
        <!-- Incoming StreamTitle from Liquidsoap is UTF-8. Without this
             Icecast assumes Latin-1 on the wire and players that sniff the
             charset mangle every multibyte character. -->
        <charset>UTF-8</charset>

        <!-- When a source drops, its listeners move to /standby (one paced
             silence stream, fed by gocast-standby.service) instead of being
             disconnected, and come back when it returns. That is what lets a
             relay broadcaster's reconnect, or a Pro container restart, pass
             without every listener having to press play again.

             `own` (2.5 only) is what makes ONE shared standby safe: a
             listener returns only to the mount they came from, never to
             whichever station reconnects first.

             /standby is a live mount, not a file. Icecast starts a fallback
             FILE only for mounts declared by name (station mounts are made on
             the fly) and serves it unpaced, so browsers buffered minutes of
             silence and came back late. Both found in the relay lab.

             A listener is never moved off /standby by Icecast: once a show
             ends for good they would sit on silence forever. The player
             stops itself when the station goes offline. -->
        <fallback-mount>/standby</fallback-mount>
        <fallback-override>own</fallback-override>

        <authentication>
            <!-- 1. Liquidsoap (Pro containers) and the standby feeder: fixed
                 user `source`. Any other username is "no match" and falls
                 through to the next role without a decision.

                 `get` and allow-admin="metadata": Liquidsoap sets the stream
                 title with a GET to /admin/metadata using these same
                 credentials. Matching only source,put (as the relay lab did)
                 answered that GET 401, and Pro stations lost their titles in
                 VLC and car radios. "metadata" and nothing more: this login
                 cannot killsource or list clients (checked against 2.5.0). -->
            <role type="static" match-method="source,put,get" allow-method="source,put,get" allow-web="*" allow-admin="metadata">
                <option name="username" value="source" />
                <option name="password" value="${ICECAST_SOURCE_PASSWORD}" />
            </role>
            <!-- 2. The relay (Free): user = station slug, password = the
                 studio's broadcast token. Laravel decides
                 (IcecastCallbackController::auth); a refusal here ends the
                 chain. Icecast asks one login at a time, so keep that
                 endpoint fast. No admin: a broadcast token is for publishing
                 audio and nothing else. -->
            <role type="url" match-method="source,put" allow-method="source,put" allow-web="*" deny-admin="*">
                <option name="client_add" value="http://127.0.0.1:__INTERNAL_API_PORT__/api/internal/icecast/auth" />
                <option name="action_add" value="stream_auth" />
                <option name="username" value="${ICECAST_CALLBACK_USER}" />
                <option name="password" value="${ICECAST_CALLBACK_PASSWORD}" />
            </role>
            <!-- 3. Listeners. -->
            <role type="anonymous" match-method="get,head,options" allow-method="get,head,options" allow-web="*" deny-admin="*" />
        </authentication>

        <!-- Relay sources have no container to report them, so Icecast does:
             these open and close the StreamSession. Container mounts are
             ignored by the endpoint. -->
        <event-bindings>
            <event type="url" trigger="source-connect">
                <option name="url" value="http://127.0.0.1:__INTERNAL_API_PORT__/api/internal/icecast/event" />
                <option name="username" value="${ICECAST_CALLBACK_USER}" />
                <option name="password" value="${ICECAST_CALLBACK_PASSWORD}" />
            </event>
            <event type="url" trigger="source-disconnect">
                <option name="url" value="http://127.0.0.1:__INTERNAL_API_PORT__/api/internal/icecast/event" />
                <option name="username" value="${ICECAST_CALLBACK_USER}" />
                <option name="password" value="${ICECAST_CALLBACK_PASSWORD}" />
            </event>
        </event-bindings>
    </mount>

    <!-- Debian/Ubuntu package layout. -->
    <paths>
        <basedir>/usr/share/icecast2</basedir>
        <logdir>/var/log/icecast2</logdir>
        <webroot>/usr/share/icecast2/web</webroot>
        <adminroot>/usr/share/icecast2/admin</adminroot>
        <alias source="/" destination="/status.xsl"/>
    </paths>

    <logging>
        <accesslog>access.log</accesslog>
        <errorlog>error.log</errorlog>
        <loglevel>3</loglevel>
        <logsize>10000</logsize>
        <logarchive>1</logarchive>
    </logging>

    <security>
        <chroot>0</chroot>
        <!-- The Debian package starts Icecast as root so it can open its
             log files, then drops to this user. Absent from the Alpine
             template because that image already runs as `icecast`. -->
        <changeowner>
            <user>icecast2</user>
            <group>icecast</group>
        </changeowner>
    </security>
</icecast>
