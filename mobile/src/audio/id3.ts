/**
 * Title and artist from an MP3's ID3 tag: ID3v2.2–2.4 at the start of the
 * file, or ID3v1 in its last 128 bytes. Pure functions over bytes so they can
 * be tested without a phone. Other formats (MP4, FLAC, Ogg) are not read yet;
 * their tracks take the filename fallback.
 */

export interface Id3Tags {
  title?: string;
  artist?: string;
}

function syncsafe(b: Uint8Array, at: number): number {
  return ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function utf16(bytes: Uint8Array, littleEndian: boolean): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    s += String.fromCharCode(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  }
  return s;
}

function utf8(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const c = bytes[i];
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c >> 5 === 0x6) {
      cp = ((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (c >> 4 === 0xe) {
      cp = ((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      cp = ((c & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      i += 4;
    }
    s += String.fromCodePoint(cp);
  }
  return s;
}

/** A text frame's body: an encoding byte, then the string. */
function decodeText(body: Uint8Array): string {
  const enc = body[0];
  const data = body.subarray(1);
  let s: string;
  if (enc === 0) s = latin1(data);
  else if (enc === 1) {
    const le = data[0] === 0xff && data[1] === 0xfe;
    const bom = (data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff);
    s = utf16(bom ? data.subarray(2) : data, le);
  } else if (enc === 2) s = utf16(data, false);
  else s = utf8(data);
  // A frame may hold several NUL-separated values; the first is the one shown.
  return s.split('\u0000')[0].trim();
}

function removeUnsync(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

/** Parse an ID3v2 tag from the start of a file, if there is one. */
export function parseId3v2(head: Uint8Array): Id3Tags {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
  const version = head[3];
  const flags = head[5];
  const size = syncsafe(head, 6);
  let tag = head.subarray(10, Math.min(head.length, 10 + size));
  if (flags & 0x80 && version < 4) tag = removeUnsync(tag);

  let pos = 0;
  // Skip an extended header.
  if (flags & 0x40) {
    const extSize = version === 4 ? syncsafe(tag, 0) : ((tag[0] << 24) | (tag[1] << 16) | (tag[2] << 8) | tag[3]) + 4;
    pos = extSize;
  }

  const idLen = version === 2 ? 3 : 4;
  const headerLen = version === 2 ? 6 : 10;
  const titleId = version === 2 ? 'TT2' : 'TIT2';
  const artistId = version === 2 ? 'TP1' : 'TPE1';
  const albumArtistId = version === 2 ? 'TP2' : 'TPE2';
  const tags: Id3Tags & { albumArtist?: string } = {};

  while (pos + headerLen <= tag.length) {
    const id = latin1(tag.subarray(pos, pos + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    let frameSize: number;
    if (version === 2) frameSize = (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5];
    else if (version === 4) frameSize = syncsafe(tag, pos + 4);
    else frameSize = (tag[pos + 4] << 24) | (tag[pos + 5] << 16) | (tag[pos + 6] << 8) | tag[pos + 7];
    const body = tag.subarray(pos + headerLen, pos + headerLen + frameSize);
    if (id === titleId) tags.title = decodeText(body);
    else if (id === artistId) tags.artist = decodeText(body);
    else if (id === albumArtistId) tags.albumArtist = decodeText(body);
    pos += headerLen + frameSize;
  }

  return {
    title: tags.title || undefined,
    artist: tags.artist || tags.albumArtist || undefined,
  };
}

/** Parse an ID3v1 tag from a file's last 128 bytes, if there is one. */
export function parseId3v1(tail: Uint8Array): Id3Tags {
  if (tail.length < 128) return {};
  const t = tail.subarray(tail.length - 128);
  if (t[0] !== 0x54 || t[1] !== 0x41 || t[2] !== 0x47) return {};
  const field = (from: number, len: number) =>
    latin1(t.subarray(from, from + len))
      .split('\u0000')[0]
      .trim();
  return { title: field(3, 30) || undefined, artist: field(33, 30) || undefined };
}
