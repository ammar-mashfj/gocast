import { Directory, File } from 'expo-file-system';

/**
 * The picked file as an upload part. Expo's fetch (the app's global fetch
 * since SDK 57) sends a file-system File as a Blob; it rejects React
 * Native's old `{ uri, name, type }` parts. The picker's copy has a generated
 * name and the API titles untagged tracks by filename, so it is moved into
 * `staging` under its original name first. Each file gets its own `staging`
 * folder: two picks can share a name.
 */
export function uploadable(uri: string, name: string, staging: Directory): File {
  const safe = name.replace(/[/\\:*?"<>|]/g, '_') || 'track';
  staging.create({ intermediates: true });
  const file = new File(uri);
  file.move(new File(staging, safe));
  return file;
}
