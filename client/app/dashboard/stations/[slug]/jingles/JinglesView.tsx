"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { IconDots, IconLoader2, IconPlus } from "@tabler/icons-react"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import { formatBytes, formatTrackTime } from "@/lib/format"
import type { JingleList, JingleRule } from "@/interfaces/JingleList"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { TextField } from "@/components/ds/Field"
import { List, ListRow } from "@/components/ds/List"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ds/Menu"
import { PageHeader } from "@/components/ds/PageHeader"
import { ProgressBar } from "@/components/ds/Progress"
import { Switch } from "@/components/ds/Switch"
import { ProTag, Tag } from "@/components/ds/Tag"
import { AutoDjSections } from "@/components/dashboard/autodj/AutoDjSections"
import { AutoDjUpsell } from "../library/AutoDjUpsell"
import { AUDIO_ACCEPT } from "../library/upload"
import { UploadProgressBar } from "../library/UploadProgressBar"
import { useTrackUpload } from "../library/useTrackUpload"
import { JingleRuleDialog } from "./JingleRuleDialog"
import { ruleSentence } from "./jingleRule"

type NameDialogState = { mode: "create" } | { mode: "rename"; list: JingleList } | null

/**
 * The Jingles page, one of AutoDJ's sections: the station's jingle lists
 * (Station IDs, Sweepers, Promos…), each a card with its clips and the one
 * rule that plays them, written out as a sentence. Clips are `tracks` rows
 * with kind "jingle" and a `jingle_list_id`, uploaded through the same
 * endpoint as music so quota and tag reading are shared.
 */
export function JinglesView({
  station,
  initialLists,
  initialJingles,
  initialMeta,
}: {
  station: Station
  initialLists: JingleList[]
  initialJingles: Track[]
  initialMeta: LibraryMeta
}) {
  const [confirm, confirmDialog] = useConfirm()
  const locked = useAutoDjLocked()
  const [lists, setLists] = useState(initialLists)
  const [jingles, setJingles] = useState(initialJingles)
  const [meta, setMeta] = useState(initialMeta)
  const [ruleFor, setRuleFor] = useState<JingleList | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null)

  const applyStorageDelta = useCallback((deltaBytes: number) => {
    setMeta((prev) => ({ ...prev, storage_used_bytes: prev.storage_used_bytes + deltaBytes }))
  }, [])

  const refetch = useCallback(async () => {
    const [listsRes, tracksRes] = await Promise.all([
      api.get<{ data: JingleList[] }>(`/stations/${station.slug}/jingle-lists`),
      api.get<{ data: Track[]; meta: LibraryMeta }>(`/stations/${station.slug}/tracks`, { params: { kind: "jingle" } }),
    ])
    setLists(listsRes.data.data)
    setJingles(tracksRes.data.data)
    setMeta(tracksRes.data.meta)
  }, [station.slug])

  const onUploaded = useCallback(
    (added: Track[]) => {
      setJingles((prev) => [...prev, ...added])
      applyStorageDelta(added.reduce((sum, t) => sum + t.file_size_bytes, 0))
      // A first upload makes a list server-side; fetch it so the card appears.
      if (added.some((t) => t.jingle_list_id && !lists.some((l) => l.id === t.jingle_list_id))) {
        void refetch().catch(() => undefined)
      }
    },
    [applyStorageDelta, lists, refetch],
  )

  async function patchList(list: JingleList, patch: Partial<JingleList>) {
    const { data } = await api.patch<{ data: JingleList }>(`/jingle-lists/${list.id}`, patch)
    setLists((prev) => prev.map((l) => (l.id === list.id ? data.data : l)))
    return data.data
  }

  async function toggle(list: JingleList, enabled: boolean) {
    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, enabled } : l)))
    try {
      await patchList(list, { enabled })
    } catch {
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, enabled: !enabled } : l)))
      toast.error("Couldn’t switch that list.")
    }
  }

  async function saveRule(rule: JingleRule) {
    if (!ruleFor) return
    await patchList(ruleFor, rule)
    toast.success("Rule saved. It applies from the next break.")
  }

  async function saveName(name: string) {
    if (nameDialog?.mode === "rename") {
      await patchList(nameDialog.list, { name })
      return
    }
    const { data } = await api.post<{ data: JingleList }>(`/stations/${station.slug}/jingle-lists`, { name })
    setLists((prev) => [...prev, data.data])
  }

  async function deleteList(list: JingleList) {
    const clips = jingles.filter((j) => j.jingle_list_id === list.id)
    const ok = await confirm({
      title: `Delete “${list.name}”?`,
      description:
        clips.length > 0
          ? `Its ${clips.length === 1 ? "jingle is" : `${clips.length} jingles are`} deleted with it. This can't be undone.`
          : "It has no jingles. This can't be undone.",
      confirmLabel: "Delete list",
      keepLabel: "Keep it",
    })
    if (!ok) return

    setLists((prev) => prev.filter((l) => l.id !== list.id))
    setJingles((prev) => prev.filter((j) => j.jingle_list_id !== list.id))
    applyStorageDelta(-clips.reduce((sum, t) => sum + t.file_size_bytes, 0))
    try {
      await api.delete(`/jingle-lists/${list.id}`)
    } catch {
      toast.error("Delete failed. Refreshing…")
      await refetch().catch(() => toast.error("Couldn't load your jingles."))
    }
  }

  async function deleteJingle(track: Track) {
    const ok = await confirm({
      title: `Delete “${track.title}”?`,
      description: "It stops playing straight away. This can't be undone.",
      confirmLabel: "Delete jingle",
      keepLabel: "Keep it",
    })
    if (!ok) return

    setJingles((prev) => prev.filter((t) => t.id !== track.id))
    applyStorageDelta(-track.file_size_bytes)
    try {
      await api.delete(`/tracks/${track.id}`)
    } catch {
      toast.error("Delete failed. Refreshing…")
      await refetch().catch(() => toast.error("Couldn't load your jingles."))
    }
  }

  async function moveJingle(track: Track, to: JingleList) {
    setJingles((prev) => prev.map((t) => (t.id === track.id ? { ...t, jingle_list_id: to.id } : t)))
    try {
      await api.patch(`/tracks/${track.id}`, { jingle_list_id: to.id })
      toast.success(`Moved to ${to.name}.`)
    } catch {
      toast.error("Couldn’t move that jingle.")
      await refetch().catch(() => undefined)
    }
  }

  const usage = meta.storage_cap_bytes > 0 ? meta.storage_used_bytes / meta.storage_cap_bytes : 0
  const stats = [
    `${lists.length} ${lists.length === 1 ? "list" : "lists"}`,
    `${jingles.length} ${jingles.length === 1 ? "jingle" : "jingles"}`,
    locked ? "plays only on Pro" : null,
    `${formatBytes(meta.storage_used_bytes)} of ${formatBytes(meta.storage_cap_bytes)}`,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-5.5">
      <AutoDjSections slug={station.slug} />
      <PageHeader
        title="Jingles"
        aside={locked && <ProTag />}
        description="Short clips AutoDJ plays between songs: station IDs, sweepers, promos. Give each kind its own list and tell it when to play."
        actions={
          !locked && (
            <Button onClick={() => setNameDialog({ mode: "create" })}>
              <IconPlus />
              New list
            </Button>
          )
        }
      />
      <div className="-mt-3.5 flex flex-col gap-2">
        <p className="font-mono text-body-sm tracking-wider text-text-faint uppercase">{stats.join(" · ")}</p>
        <ProgressBar
          value={usage}
          tone={usage >= 0.95 ? "live" : "onair"}
          label={`Storage: ${formatBytes(meta.storage_used_bytes)} of ${formatBytes(meta.storage_cap_bytes)} used`}
          className="h-0.75 max-w-md"
        />
      </div>

      {locked && <AutoDjUpsell stationName={station.name} />}

      {lists.length === 0 ? (
        <FirstList slug={station.slug} locked={locked} onUploaded={onUploaded} onCreate={() => setNameDialog({ mode: "create" })} />
      ) : (
        lists.map((list) => (
          <JingleListCard
            key={list.id}
            slug={station.slug}
            list={list}
            jingles={jingles.filter((j) => j.jingle_list_id === list.id)}
            others={lists.filter((l) => l.id !== list.id)}
            locked={locked}
            onUploaded={onUploaded}
            onToggle={(on) => void toggle(list, on)}
            onEditRule={() => setRuleFor(list)}
            onRename={() => setNameDialog({ mode: "rename", list })}
            onDelete={() => void deleteList(list)}
            onDeleteJingle={(t) => void deleteJingle(t)}
            onMoveJingle={(t, to) => void moveJingle(t, to)}
          />
        ))
      )}

      <p className="max-w-[34rem] text-body-sm text-pretty text-text-faint">
        {locked ? "On Pro, drop" : "Drop"} MP3, M4A, AAC, FLAC, OGG or WAV files on a list, up to 300 MB each. Jingles share your
        storage with your music. Only one jingle plays per break; if two lists are due at once, set times go first and the other
        waits for the next break.
      </p>

      <JingleRuleDialog
        list={ruleFor}
        jingles={ruleFor ? jingles.filter((j) => j.jingle_list_id === ruleFor.id) : []}
        timezone={station.timezone}
        slug={station.slug}
        onClose={() => setRuleFor(null)}
        onSave={saveRule}
      />
      <ListNameDialog dialog={nameDialog} onClose={() => setNameDialog(null)} onSubmit={saveName} />
      {confirmDialog}
    </div>
  )
}

/** One list: its switch, its rule as a sentence, its clips, and a drop target for more. */
function JingleListCard({
  slug,
  list,
  jingles,
  others,
  locked,
  onUploaded,
  onToggle,
  onEditRule,
  onRename,
  onDelete,
  onDeleteJingle,
  onMoveJingle,
}: {
  slug: string
  list: JingleList
  jingles: Track[]
  others: JingleList[]
  locked: boolean
  onUploaded: (added: Track[]) => void
  onToggle: (on: boolean) => void
  onEditRule: () => void
  onRename: () => void
  onDelete: () => void
  onDeleteJingle: (track: Track) => void
  onMoveJingle: (track: Track, to: JingleList) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const { progress, uploading, upload } = useTrackUpload({ slug, kind: "jingle", jingleListId: list.id, noun: "jingle", onUploaded })
  const pinned = jingles.find((j) => j.id === list.pinned_track_id)
  const off = !list.enabled || locked

  return (
    <Card
      size="none"
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver && !locked) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
      }}
      className={cn(
        "rounded-card outline-offset-4 transition-[outline-color]",
        dragOver ? "outline-2 outline-dashed outline-line-strong" : "outline-transparent",
      )}
    >
      <input
        ref={fileInput}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files)
          e.target.value = ""
        }}
      />

      <div className="flex flex-col gap-3 px-5.5 pt-5 pb-3.5">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-heading">{list.name}</h2>
          {!list.enabled && <Tag>Off</Tag>}
          <Switch aria-label={`Play ${list.name}`} checked={list.enabled} onCheckedChange={onToggle} disabled={locked} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="quiet" size="icon-sm" aria-label={`${list.name} options`}>
                <IconDots />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onEditRule}>Edit rule</DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-error">
                Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-well bg-surface-raised px-4 py-3", off && "opacity-60")}>
          <p className="min-w-0 text-body text-pretty">{ruleSentence(list, pinned?.title)}</p>
          <Button size="sm" variant="subtle" onClick={onEditRule} disabled={locked}>
            Edit rule
          </Button>
        </div>
        {list.enabled && jingles.length === 0 && !locked && (
          <p role="status" className="text-body-sm text-fault-text">
            This list has no jingles yet, so nothing plays from it.
          </p>
        )}
      </div>

      {progress && <UploadProgressBar progress={progress} className="border-t border-line bg-surface-raised px-5.5 py-3" />}

      {jingles.length > 0 && (
        <List className="px-5.5">
          {jingles.map((jingle) => (
            <ListRow
              key={jingle.id}
              title={jingle.title}
              meta={jingle.original_filename}
              trailing={
                <span className="flex shrink-0 items-center gap-1">
                  {list.pick === "single" && jingle.id === list.pinned_track_id && <Tag variant="onair">Plays</Tag>}
                  <span className="font-mono text-caption text-muted-foreground tabular-nums">
                    {jingle.duration_seconds > 0 ? formatTrackTime(Math.round(jingle.duration_seconds)) : "—"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="quiet" aria-label={`${jingle.title} options`}>
                        <IconDots />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {others.length > 0 && (
                        <>
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {others.map((to) => (
                            <DropdownMenuItem key={to.id} onClick={() => onMoveJingle(jingle, to)}>
                              {to.name}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => onDeleteJingle(jingle)} className="text-error">
                        Delete jingle
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              }
            />
          ))}
        </List>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5.5 py-3.5">
        <span className="text-body-sm text-text-faint">
          {jingles.length === 0 ? "Drop clips here, or browse." : `${jingles.length} ${jingles.length === 1 ? "jingle" : "jingles"}`}
        </span>
        {!locked && (
          <Button size="sm" variant="subtle" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
            {uploading ? "Uploading…" : "Add jingles"}
          </Button>
        )}
      </div>
    </Card>
  )
}

/** No lists yet: upload straight away (the server makes a "Jingles" list), or name one first. */
function FirstList({
  slug,
  locked,
  onUploaded,
  onCreate,
}: {
  slug: string
  locked: boolean
  onUploaded: (added: Track[]) => void
  onCreate: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const { progress, uploading, upload } = useTrackUpload({ slug, kind: "jingle", noun: "jingle", onUploaded })

  return (
    <Card
      size="none"
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver && !locked) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files)
      }}
      className={cn(
        "rounded-card outline-offset-4 transition-[outline-color]",
        dragOver ? "outline-2 outline-dashed outline-line-strong" : "outline-transparent",
      )}
    >
      <input
        ref={fileInput}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files)
          e.target.value = ""
        }}
      />
      {progress && <UploadProgressBar progress={progress} className="bg-surface-raised px-5.5 py-3" />}
      <div className="flex flex-col items-center gap-3 px-5.5 py-10 text-center">
        <p className="font-display text-body font-bold">No jingles yet</p>
        <p className="max-w-[44ch] text-body-sm text-pretty text-muted-foreground">
          A station ID is usually 5–15 seconds. Drop clips here and they go into a “Jingles” list that plays a random one every 4
          songs. You can change that, and add more lists, after.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="subtle" onClick={() => fileInput.current?.click()} disabled={uploading || locked}>
            {locked ? "Jingles need Pro" : uploading ? "Uploading…" : "Browse"}
          </Button>
          {!locked && (
            <Button variant="quiet" onClick={onCreate}>
              Name a list first
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** One small dialog for "New list" and "Rename". */
function ListNameDialog({
  dialog,
  onClose,
  onSubmit,
}: {
  dialog: NameDialogState
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<NameDialogState>(null)

  // Reset to the dialog's starting name each time it opens.
  if (dialog !== openedFor) {
    setOpenedFor(dialog)
    setName(dialog?.mode === "rename" ? dialog.list.name : "")
    setError(null)
    setSaving(false)
  }

  async function submit() {
    const trimmed = name.trim()
    if (trimmed === "" || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      onClose()
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { errors?: { name?: string[] } } } })?.response?.data?.errors?.name?.[0] ?? "Couldn’t save that name.",
      )
      setSaving(false)
    }
  }

  return (
    <Dialog open={dialog !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "rename" ? "Rename list" : "New jingle list"}</DialogTitle>
          <DialogDescription>
            {dialog?.mode === "rename"
              ? "Listeners never see this; it’s for you."
              : "One kind of clip, like Station IDs or Sweepers. It starts as a random jingle every 4 songs; set its rule after."}
          </DialogDescription>
        </DialogHeader>
        <TextField
          label="List name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Station IDs"
          maxLength={60}
          autoFocus
          error={error}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
        />
        <DialogFooter>
          <Button size="lg" onClick={submit} disabled={name.trim() === "" || saving}>
            {saving ? "Saving…" : dialog?.mode === "rename" ? "Rename" : "Create list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
