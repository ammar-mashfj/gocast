#!/usr/bin/env node
// `npm start`: Metro plus the dev ingest proxy, in one terminal.
//
// The phone can't reach the station router on this laptop's loopback, so a
// dev live show needs scripts/ingest-proxy.mjs running next to Metro (see
// EXPO_PUBLIC_INGEST_URL in .env). This starts both, prefixes the proxy's
// lines, and stops the proxy when Metro exits. Extra arguments go to
// `expo start`, e.g. `npm start -- --clear`.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const proxy = spawn(process.execPath, [path.join(root, 'scripts/ingest-proxy.mjs')], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let proxyErr = '';
proxy.stdout.on('data', (chunk) => process.stdout.write(chunk));
proxy.stderr.on('data', (chunk) => {
  proxyErr += chunk;
});
proxy.on('exit', (code, signal) => {
  if (signal || stopping) return;
  // Metro keeps running either way; say why the proxy isn't there.
  const why = proxyErr.includes('EADDRINUSE')
    ? 'port 18091 is already in use (another ingest proxy running?)'
    : proxyErr.trim().split('\n').slice(-1)[0] || `exit ${code}`;
  console.log(`[ingest-proxy] not running: ${why}`);
});

const metro = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });

let stopping = false;
const stop = () => {
  stopping = true;
  proxy.kill();
};
metro.on('exit', (code) => {
  stop();
  process.exit(code ?? 0);
});
// Ctrl+C reaches both children through the terminal; this covers a plain kill.
process.on('SIGTERM', () => {
  stop();
  metro.kill('SIGTERM');
});
