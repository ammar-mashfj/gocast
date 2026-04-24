<?xml version="1.0"?>
<!--
    GoCast Icecast 2 config (containerized).

    Derived from Icecast's stock icecast.xml with three customisations that
    were previously documented in icecast.xml.snippet:

      1. <sources> raised to 50 so concurrent broadcasters aren't squeezed
         out by the always-on standby source.
      2. <mount type="default"> declares /standby.mp3 as the fallback with
         override=1, so listeners are transparently routed to the standby
         bed whenever a broadcaster disconnects, and moved back the moment
         they reconnect. Burst/queue sizes are tuned down from defaults to
         keep the fallback transition gap short.
      3. <mount type="normal" name="/standby.mp3"> is declared explicitly so
         it does NOT inherit the default's fallback-mount (which would self
         loop), and is hidden from the public YP directory.

    Passwords are filled in from environment variables at container start —
    see infra/icecast/Dockerfile's CMD wrapper or compose's env. For dev the
    default is "docker-dev"; production MUST override.
-->
<icecast>
    <location>Earth</location>
    <admin>hello@gocast.fm</admin>

    <limits>
        <clients>500</clients>
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

    <hostname>localhost</hostname>

    <listen-socket>
        <port>8000</port>
    </listen-socket>

    <http-headers>
        <header name="Access-Control-Allow-Origin" value="*" />
    </http-headers>

    <mount type="default">
        <fallback-mount>/standby.mp3</fallback-mount>
        <fallback-override>1</fallback-override>
        <hidden>0</hidden>
        <public>0</public>
        <burst-size>16384</burst-size>
        <queue-size>131072</queue-size>
    </mount>

    <mount type="normal">
        <mount-name>/standby.mp3</mount-name>
        <hidden>1</hidden>
        <public>0</public>
        <burst-size>65536</burst-size>
    </mount>

    <paths>
        <basedir>/var/lib/icecast</basedir>
        <logdir>/var/log/icecast</logdir>
        <webroot>/usr/share/icecast/web</webroot>
        <adminroot>/usr/share/icecast/admin</adminroot>
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
    </security>
</icecast>
