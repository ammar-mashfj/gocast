<?xml version="1.0"?>
<!--
    GoCast Icecast 2 config — NATIVE (Debian/Ubuntu icecast2 package).

    Content is identical to infra/icecast/icecast.xml.tpl; only the <paths>
    block differs. The Alpine package installs under /usr/share/icecast and
    logs to /var/log/icecast; Debian's icecast2 package uses
    /usr/share/icecast2 and /var/log/icecast2. Pointing at the Alpine paths
    on Ubuntu makes Icecast start, serve audio correctly, and 404 its own
    status page — which is a confusing way to discover the mistake.

    Render with the same envsubst call the container entrypoint uses:

      envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_RELAY_PASSWORD} \
                ${ICECAST_ADMIN_USER} ${ICECAST_ADMIN_PASSWORD}' \
        < infra/native/icecast/icecast.xml.tpl \
        | sudo tee /etc/icecast2/icecast.xml

    setup-native.sh does this for you. Passwords MUST match the ones in
    api/.env — a mismatch means every station gets 401 on SOURCE connect and
    the symptom is "station starts, then goes unhealthy 45 seconds later".
-->
<icecast>
    <location>Earth</location>
    <admin>hello@gocast.fm</admin>

    <limits>
        <clients>500</clients>
        <!-- Raised from the stock 2 so concurrent broadcasters are not
             squeezed out by the always-on standby source. -->
        <sources>50</sources>
        <queue-size>524288</queue-size>
        <client-timeout>30</client-timeout>
        <header-timeout>15</header-timeout>
        <source-timeout>10</source-timeout>
        <burst-on-connect>1</burst-on-connect>
        <burst-size>65535</burst-size>
    </limits>

    <authentication>
        <source-password>${ICECAST_SOURCE_PASSWORD}</source-password>
        <relay-password>${ICECAST_RELAY_PASSWORD}</relay-password>
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
        `host.docker.internal`, which `--add-host host-gateway` resolves to
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
        <!-- Listeners are moved here transparently whenever a station's
             source drops, and back the moment it returns, so a broadcaster
             reconnect does not disconnect the audience. Fed by
             gocast-standby.service. -->
        <fallback-mount>/standby.mp3</fallback-mount>
        <fallback-override>1</fallback-override>
        <hidden>0</hidden>
        <public>0</public>
        <!-- Tuned down from the defaults: a smaller burst means a shorter
             audible gap on the fallback transition. -->
        <burst-size>16384</burst-size>
        <queue-size>131072</queue-size>
        <!-- Incoming StreamTitle from Liquidsoap is UTF-8. Without this
             Icecast assumes Latin-1 on the wire and players that sniff the
             charset mangle every multibyte character. -->
        <charset>UTF-8</charset>
    </mount>

    <!-- Declared explicitly so it does NOT inherit the default's
         fallback-mount, which would make it fall back to itself. -->
    <mount type="normal">
        <mount-name>/standby.mp3</mount-name>
        <hidden>1</hidden>
        <public>0</public>
        <burst-size>65536</burst-size>
    </mount>

    <!-- Debian/Ubuntu package layout. This is the only block that differs
         from the containerised template. -->
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
