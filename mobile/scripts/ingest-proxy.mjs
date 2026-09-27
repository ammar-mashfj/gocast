#!/usr/bin/env node
// Dev only: expose the station router's loopback broadcast port on the LAN.
//
// The API's ingest_url is a station container's Docker bridge IP, which only
// this laptop can route to. The station router already proxies every station
// at 127.0.0.1:8091/broadcast/{slug}, but it is published on loopback only, so
// the phone cannot reach it. This forwards raw TCP from 0.0.0.0:18091 to it;
// the WebSocket upgrade passes through untouched.
//
//   node scripts/ingest-proxy.mjs
//
// The app points at it through EXPO_PUBLIC_INGEST_URL in mobile/.env.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const LISTEN_PORT = Number(process.env.PORT ?? 18091);
const TARGET = { host: '127.0.0.1', port: 8091 };
// Debugging aid: with DUMP_DIR set, each connection's phone → server bytes are
// written to a file there, to decode what the phone actually sent.
const DUMP_DIR = process.env.DUMP_DIR;

net
  .createServer((client) => {
    const upstream = net.connect(TARGET);
    const from = `${client.remoteAddress}:${client.remotePort}`;
    console.log(`[ingest-proxy] ${from} connected`);
    if (DUMP_DIR) {
      const dump = fs.createWriteStream(path.join(DUMP_DIR, `ingest-${Date.now()}.bin`));
      client.on('data', (chunk) => dump.write(chunk));
      client.on('close', () => dump.end());
    }
    client.pipe(upstream).pipe(client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', close).on('close', () => {
      console.log(`[ingest-proxy] ${from} closed`);
      close();
    });
    upstream.on('error', (err) => {
      console.log(`[ingest-proxy] upstream error: ${err.message}`);
      close();
    });
  })
  .listen(LISTEN_PORT, '0.0.0.0', () => {
    console.log(`[ingest-proxy] 0.0.0.0:${LISTEN_PORT} → ${TARGET.host}:${TARGET.port}`);
  });
