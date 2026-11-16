import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import type { Track } from "@/interfaces/Track"
import { TrackRow } from "./TrackRow"

const track: Track = {
  id: "t1",
  station_id: "s1",
  kind: "music",
  title: "Night Drive",
  artist: "Low Tide",
  duration_seconds: 200,
  file_size_bytes: 4_000_000,
  position: 1,
  original_filename: "night-drive.mp3",
  created_at: "2026-11-01T10:00:00Z",
}

function renderRow(props: Partial<React.ComponentProps<typeof TrackRow>>) {
  return render(
    <DndContext>
      <SortableContext items={[track.id]}>
        <TrackRow track={track} number={1} reorderable={false} onAir={false} onEdit={vi.fn()} {...props} />
      </SortableContext>
    </DndContext>,
  )
}

describe("TrackRow actions", () => {
  it("a playlist row offers Remove and a separately labelled Delete file", async () => {
    const onRemove = vi.fn()
    const onDelete = vi.fn()
    renderRow({ onRemove, onDelete })

    expect(screen.getByRole("button", { name: "Remove Night Drive from this playlist" })).toHaveTextContent(/^Remove$/)
    const del = screen.getByRole("button", { name: "Delete Night Drive" })
    expect(del).toHaveTextContent("Delete file")
    expect(del).toHaveClass("text-error")

    await userEvent.click(del)
    expect(onDelete).toHaveBeenCalledWith("t1")
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("Remove only removes, never deletes", async () => {
    const onRemove = vi.fn()
    const onDelete = vi.fn()
    renderRow({ onRemove, onDelete })

    await userEvent.click(screen.getByRole("button", { name: "Remove Night Drive from this playlist" }))
    expect(onRemove).toHaveBeenCalledWith("t1")
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("a library row keeps the plain Delete label and has no Remove", () => {
    renderRow({ onDelete: vi.fn() })
    const del = screen.getByRole("button", { name: "Delete Night Drive" })
    expect(del).toHaveTextContent(/^Delete$/)
    expect(del).not.toHaveClass("text-error")
    expect(screen.queryByRole("button", { name: /from this playlist/ })).toBeNull()
  })

  it("the phone menu lists Delete file beside Remove from playlist", async () => {
    const onDelete = vi.fn()
    renderRow({ onRemove: vi.fn(), onDelete })

    await userEvent.click(screen.getByRole("button", { name: "Actions for Night Drive" }))
    expect(await screen.findByRole("menuitem", { name: "Remove from this playlist" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete file" }))
    expect(onDelete).toHaveBeenCalledWith("t1")
  })
})
