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
