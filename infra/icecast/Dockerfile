# Icecast 2.4.4 on Alpine — smallest image that ships the current stable.
# Alpine 3.20's `icecast` package tracks upstream releases closely, which is
# why we prefer it over the years-stale Debian/Ubuntu packages.
#
# gettext provides `envsubst`, which the entrypoint uses to render the
# config template with password env vars at container start — keeps secrets
# out of the committed XML.
FROM alpine:3.20

RUN apk add --no-cache icecast gettext \
    && mkdir -p /var/log/icecast /var/lib/icecast \
    && chown -R icecast:icecast /var/log/icecast /var/lib/icecast

COPY icecast.xml.tpl /etc/icecast.xml.tpl
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER icecast
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
