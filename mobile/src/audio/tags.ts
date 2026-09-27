import { File } from 'expo-file-system';

import { parseId3v1, parseId3v2 } from './id3';

/**
 * Title and artist for a queued file, as the web studio reads them
 * (readTagsFromFile in client/lib/audioEngine.ts): the file's own tags first,
 * then the filename. An untagged "Artist - Title.mp3" is split on the dash,
 * unless the left side is a track number ("01 - Intro"); otherwise the name
 * is the title and the artist is ''.
 *
 * Only MP3 (ID3) tags are read on the phone so far; see id3.ts.
 */

/** Enough for any ID3v2 tag without cover art; covers are skipped past. */
const HEAD_BYTES = 256 * 1024;

export async function readTags(path: string, fileName: string): Promise<{ title: string; artist: string }> {
  const fallback = tagsFromFileName(fileName);
  try {
    const tags = readId3(path);
    const title = tags.title?.trim();
    const artist = tags.artist?.trim();
    // A tagged title with no artist keeps the tag's title; the filename's
    // artist half belongs to the filename's title, not to this one.
    return title ? { title, artist: artist ?? '' } : { title: fallback.title, artist: artist || fallback.artist };
  } catch {
    return fallback;
  }
}

function readId3(path: string) {
  const file = new File(`file://${path}`);
  const handle = file.open();
  try {
    const size = handle.size ?? 0;
    const head = handle.readBytes(Math.min(HEAD_BYTES, size));
    // A tag larger than HEAD_BYTES is almost always cover art; read the rest.
    if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const tagSize = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
      let full = head;
      if (tagSize + 10 > head.length && tagSize + 10 <= size) {
        handle.offset = 0;
        full = handle.readBytes(tagSize + 10);
      }
      const v2 = parseId3v2(full);
      if (v2.title || v2.artist) return v2;
    }
    if (size >= 128) {
      handle.offset = size - 128;
      return parseId3v1(handle.readBytes(128));
    }
    return {};
  } finally {
    handle.close();
  }
}

export function tagsFromFileName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, '');
  const dash = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return dash && !/^\d+$/.test(dash[1].trim())
    ? { title: dash[2].trim(), artist: dash[1].trim() }
    : { title: base, artist: '' };
}
