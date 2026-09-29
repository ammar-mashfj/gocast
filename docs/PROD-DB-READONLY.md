# Read-only access to the production database

MySQL on the prod box listens on loopback only (`127.0.0.1:3306`, see
`infra/native/README.md`). You reach it through an SSH tunnel as a
tunnel-only Linux user, then log in to MySQL as a user that can only `SELECT`.
Two separate locks: the SSH account can't get a shell, and the MySQL
account can't write. Either one alone isn't enough.

```
laptop:3307 ──ssh (dbtunnel, forward-only)──▶ prod 127.0.0.1:3306 ──▶ MySQL user gocast_reader (SELECT only)
```

## Daily use

```bash
# 1. Open the tunnel (no shell; Ctrl-C closes it). Add -f to background it.
ssh -N gocast-db

# 2. In another terminal
mysql --defaults-extra-file=~/.config/gocast/prod-ro.cnf gocast
```

For DBeaver / TablePlus / DataGrip, skip step 1 and use the client's own SSH
tunnel setting instead: SSH host `151.247.208.83`, user `dbtunnel`, key
`~/.ssh/gocast_db`; DB host `127.0.0.1`, port `3306`, user `gocast_reader`.
Tick the client's "read-only connection" option too, as a third lock.

Close the tunnel when you're done. A forgotten `ssh -f` keeps port 3307 open
to prod for anything on your laptop.

## Laptop setup (once)

`~/.ssh/config` already contains:

```
Host gocast-db
      HostName 151.247.208.83
      User dbtunnel
      IdentityFile ~/.ssh/gocast_db
      IdentitiesOnly yes
      LocalForward 3307 127.0.0.1:3306
```

Keep the password out of shell history and out of the repo:

```bash
mkdir -p ~/.config/gocast
install -m 600 /dev/null ~/.config/gocast/prod-ro.cnf
cat > ~/.config/gocast/prod-ro.cnf <<'EOF'
[client]
host=127.0.0.1
port=3307
protocol=TCP
user=gocast_reader
password=<the gocast_reader password>
EOF
```

`protocol=TCP` matters: with `host=localhost` (or no protocol) the client
uses your **local** MySQL socket and you'll be querying your dev database
while thinking it's prod. Sanity-check each session with
`SELECT @@hostname;`.

## Server setup (once, as root on prod)

`gocast_reader` already exists on prod (SELECT on `gocast` only, local connections only). Kept here for rebuilding the box.

### 1. Tunnel-only SSH user

```bash
adduser --disabled-password --gecos "" --shell /usr/sbin/nologin dbtunnel
install -d -m 700 -o dbtunnel -g dbtunnel /home/dbtunnel/.ssh
```

Put the laptop's `~/.ssh/gocast_db.pub` in `/home/dbtunnel/.ssh/authorized_keys`
as **one line** with these options in front of the key:

```
restrict,port-forwarding,permitopen="127.0.0.1:3306",command="/bin/false" ssh-ed25519 AAAA... ammar-laptop
```

`restrict` turns off everything (PTY, agent/X11 forwarding, remote
forwards); `port-forwarding` + `permitopen` turn back on exactly one local
forward, to MySQL. `command="/bin/false"` means even `ssh gocast-db` with
no `-N` gets no shell.

```bash
chown dbtunnel:dbtunnel /home/dbtunnel/.ssh/authorized_keys
chmod 600 /home/dbtunnel/.ssh/authorized_keys
```

If `sshd_config` has `AllowUsers`/`AllowGroups`, add `dbtunnel` and
`systemctl reload ssh`.

### 2. Read-only MySQL user

```sql
CREATE USER IF NOT EXISTS 'gocast_reader'@'localhost'
  IDENTIFIED BY '<long random password>'
  WITH MAX_USER_CONNECTIONS 3;

GRANT SELECT ON gocast.* TO 'gocast_reader'@'localhost';
```

- Prod has `'gocast_reader'@'localhost'`, and tunnelled TCP logins from
  127.0.0.1 do match it (verified 2026-09-29: `CURRENT_USER()` reports
  `gocast_reader@localhost`). The server resolves 127.0.0.1 to `localhost`.
  If a rebuilt server has `skip-name-resolve` on, that match stops working
  and you get `Access denied`. Fix it by adding the same user
  `@'127.0.0.1'`.
- No `PROCESS`, `LOCK TABLES`, or `RELOAD`. That rules out `mysqldump`
  with default flags. Take dumps on the server (as `deploy-native.sh` does)
  instead of pulling prod data to the laptop.
- `MAX_USER_CONNECTIONS` stops a GUI client that opens a pool from using up
  the box's connections.

Verify:

```sql
SHOW GRANTS FOR 'gocast_reader'@'localhost';
-- prod returns exactly:
-- GRANT USAGE ON *.* TO `gocast_reader`@`localhost`
-- GRANT SELECT ON `gocast`.* TO `gocast_reader`@`localhost`
```

Optional, stricter: leave secrets out by granting per table instead of
`gocast.*`, skipping `personal_access_tokens`, `password_reset_tokens`,
`sessions`, and anything holding stream keys. This is more work to maintain,
because every new table needs its own grant.

## Querying prod without hurting it

The box is small: MySQL shares RAM with 12 PHP children, Next, Redis and
the Liquidsoap containers. A read-only user can still slow everything down
with one bad query.

- Cap long queries for the session:
  `SET SESSION max_execution_time = 10000;` (ms, applies to `SELECT`).
- Always put a `LIMIT` on exploratory queries. `listener_sessions` and
  `station_events` are the big, growing tables.
- Don't hold a transaction open in a GUI client. Autocommit off plus an
  idle tab keeps a read view open and blocks purge.
- Anything that needs a full scan of a large table: take a dump on the
  server and query a local copy instead.

## Revoking

```sql
DROP USER 'gocast_reader'@'localhost';
```

and/or delete the key line from `/home/dbtunnel/.ssh/authorized_keys`.
Revoke on the server. Deleting the laptop key isn't enough if it has
ever been copied somewhere else.
