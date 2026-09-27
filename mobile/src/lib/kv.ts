import { File, Paths } from 'expo-file-system';

/**
 * Small JSON values kept in the app's documents directory, the phone's
 * stand-in for the web studio's localStorage. Every access is guarded: a
 * corrupt or missing file reads as the fallback, and a failed write only
 * costs the value for this session.
 */

function fileFor(key: string): File {
  return new File(Paths.document, `${key.replace(/[^a-z0-9._-]/gi, '_')}.json`);
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const file = fileFor(key);
    if (!file.exists) return fallback;
    return JSON.parse(file.textSync()) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    fileFor(key).write(JSON.stringify(value));
  } catch {
    /* the value lasts for this session only */
  }
}

export function removeJson(key: string): void {
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {
    /* already gone */
  }
}
