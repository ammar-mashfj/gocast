"use client"

import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/format"
import type { UploadProgress } from "./useTrackUpload"

/** "12s left" / "3m left". Coarser than a clock on purpose — the estimate isn't that good. */
function formatEta(seconds: number): string {
  if (seconds < 10) return "a few seconds left"
  if (seconds < 60) return `${Math.round(seconds / 5) * 5}s left`
  return `${Math.round(seconds / 60)}m left`
}

/**
 * The meter for an in-flight upload, shared by the rotation panel and the
 * jingle dialog. A spinner and the word "Uploading…" was the whole of the old
 * feedback, which for a folder of hour-long mixes could sit there for minutes
 * looking indistinguishable from a hang.
 */
export function UploadProgressBar({
  progress,
  className,
}: {
  progress: UploadProgress
  className?: string
}) {
  const { totalFiles, filesSent, currentFile, totalBytes, sentBytes, processing } = progress
  const pct = totalBytes === 0 ? 0 : Math.min(100, (sentBytes / totalBytes) * 100)

  // Once the bytes are up the server still has to read tags and commit, and
  // that gap is long enough on a big drop to need its own words — a bar
  // parked at 100% reads as stuck.
  const label = processing
    ? `Processing ${totalFiles} file${totalFiles === 1 ? "" : "s"}…`
    : totalFiles === 1
      ? `Uploading ${currentFile ?? "1 file"}`
      : `Uploading ${Math.min(filesSent + 1, totalFiles)} of ${totalFiles}${
          currentFile ? ` — ${currentFile}` : ""
        }`

  const detail = processing
    ? formatBytes(totalBytes)
    : [
        `${Math.round(pct)}%`,
        `${formatBytes(sentBytes)} of ${formatBytes(totalBytes)}`,
        progress.bytesPerSecond === null ? null : `${formatBytes(progress.bytesPerSecond)}/s`,
        progress.secondsLeft === null || progress.secondsLeft < 3
          ? null
          : formatEta(progress.secondsLeft),
      ]
        .filter(Boolean)
        .join(" · ")

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{detail}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-primary",
            // No width transition while bytes are moving: progress events
            // arrive faster than the animation settles and the bar lags
            // visibly behind the percentage next to it.
            processing && "animate-pulse",
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  )
}
