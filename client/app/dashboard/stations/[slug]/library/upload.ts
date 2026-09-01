/**
 * Shared bits between the two upload surfaces on this screen — the AutoDJ
 * rotation and the jingle dialog. They post to the same endpoint with a
 * different `kind`, so the accepted formats, the client-side filter and the
 * error shape have to agree; keeping one copy is what makes that true rather
 * than a coincidence.
 */

/** Kept in step with StoreTrackRequest's `mimes:` rule. */
export const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|flac|ogg|wav)$/i

export const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.aac,.flac,.ogg,.wav"

/**
 * Browsers report an empty or wrong `type` often enough (WAVs as
 * application/octet-stream, anything dragged from an archive) that the
 * extension has to be a fallback rather than a second opinion.
 */
export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name)
}

/**
 * Pull something sayable out of an upload failure. The server answers with
 * either Laravel validation errors (per-file: too big, wrong format) or a
 * plain message (the quota, which is raised from the importer), and the
 * difference is not worth showing the user.
 */
export function uploadErrorMessage(err: unknown): string {
  const body = (
    err as {
      response?: { data?: { message?: string; errors?: Record<string, string[]> } }
    }
  ).response?.data

  if (body?.errors) {
    return Object.values(body.errors).flat()[0] ?? "Upload failed"
  }

  return body?.message ?? "Upload failed"
}

/**
 * One POST carries one multipart body, and PHP caps that at `post_max_size`
 * (640M in php/uploads.ini) — a limit that has nothing to do with the
 * per-station storage cap. Now that a single file may be 300 MB, a DJ
 * dropping a folder of hour-long mixes exceeds it easily, and the failure is
 * a bare 413 from nginx with no Laravel body to turn into a message.
 *
 * Splitting here rather than raising post_max_size to cover the whole cap:
 * PHP buffers the request before Laravel sees it, so a 2 GB body would be a
 * 2 GB commitment on one worker with no progress and no resume.
 */
const MAX_BATCH_BYTES = 500 * 1024 * 1024
/** Matches `max_file_uploads` in php/uploads.ini and the `files` rule. */
const MAX_BATCH_FILES = 30

/**
 * Group files into batches that fit one request. A single file over the
 * batch ceiling still gets its own batch — the server's per-file rule is
 * what should reject it, with a message, rather than nginx.
 */
export function batchFiles(files: File[]): File[][] {
  const batches: File[][] = []
  let current: File[] = []
  let bytes = 0

  for (const file of files) {
    const wouldOverflow = bytes + file.size > MAX_BATCH_BYTES || current.length >= MAX_BATCH_FILES

    if (current.length > 0 && wouldOverflow) {
      batches.push(current)
      current = []
      bytes = 0
    }

    current.push(file)
    bytes += file.size
  }

  if (current.length > 0) batches.push(current)

  return batches
}
