"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { toast } from "sonner"
import { IconArrowDown, IconArrowUp, IconPlus, IconWorld, IconX } from "@tabler/icons-react"
import api from "@/lib/axios"
import type { SocialLink, Station } from "@/interfaces/Station"
import {
  MAX_SOCIAL_LINKS,
  PICKER_PLATFORMS,
  cleanHandle,
  matchPickerPlatform,
  normalizeSocialUrl,
  resolveSocialLink,
  type PickerPlatform,
} from "@/lib/socialLinks"
import { Button } from "@/components/ds/Button"
import { DialogFooter } from "@/components/ds/Dialog"
import { Input } from "@/components/ds/Field"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ds/Menu"
import { SettingsTile } from "./SettingsTile"

/**
 * Where listeners can find the station off GoCast, shown as icons on the
 * player page.
 *
 * Add link picks a platform (one each) and the owner types only the handle,
 * after the fixed part of the address; or Other link, a full address and an
 * optional name, for anything else (a website, a tip jar). Nothing is refused:
 * Other still gets its icon from the address (lib/socialLinks).
 *
 * The tile opens a dialog holding a draft: add, edit, reorder and remove,
 * then Save sends the whole list in one PUT (the links have no ids; their
 * order is the array's). The rows live here, not in the dialog, so closing
 * it keeps an unsaved draft, and the tile says so.
 * Saved links load back into their platform's row by address; anything that
 * doesn't match a platform's base loads as an Other link, unchanged.
 */

type Row =
  | { key: string; kind: "platform"; platform: PickerPlatform; handle: string; label: string | null }
  | { key: string; kind: "other"; url: string; label: string }

let nextKey = 0
const newKey = () => `row-${nextKey++}`

function toRow(link: SocialLink): Row {
  const match = matchPickerPlatform(link.url)
  if (match) return { key: newKey(), kind: "platform", platform: match.platform, handle: match.handle, label: link.label }
  return { key: newKey(), kind: "other", url: link.url, label: link.label ?? "" }
}

/** The row as it would be saved, or a sentence saying what's wrong with it. */
function toLink(row: Row): SocialLink | string {
  if (row.kind === "platform") {
    const handle = cleanHandle(row.platform, row.handle)
    if (handle === "") return `Fill in your ${row.platform.name}, or remove it.`
    // An address can't hold a space, and the API's refusal named the field
    // path ("social_links.0.url"), which no one can map to a row.
    if (/\s/.test(handle)) return `Your ${row.platform.name} name can’t have spaces.`
    return { label: row.label, url: `${row.platform.base}${handle}` }
  }
  const url = normalizeSocialUrl(row.url)
  if (url === "") return "One of your links has no address. Fill it in, or remove it."
  if (resolveSocialLink({ label: null, url }) === null) return `“${row.url.trim()}” doesn’t look like a web address.`
  return { label: row.label.trim() || null, url }
}

/**
 * Compared through toLink, not the stored JSON: a saved "www.instagram.com/x"
 * rebuilds as "instagram.com/x", which is not a change the owner made. An
 * unfinished row counts as one, so the warning shows while typing.
 */
function snapshot(rows: Row[]): string {
  return JSON.stringify(rows.map(toLink).map((r) => (typeof r === "string" ? r : [r.label, r.url])))
}

/** The tile's line: "Instagram, YouTube and 1 more", or what they're for. */
function summary(rows: Row[]): string {
  if (rows.length === 0) return "None yet. Add the places listeners can follow you."
  const names = rows.map((r) => (r.kind === "platform" ? r.platform.name : resolveSocialLink({ label: r.label || null, url: normalizeSocialUrl(r.url) })?.name ?? "Other link"))
  if (names.length <= 3) return names.join(", ")
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`
}

export function LinksCard({ station }: { station: Station }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(() => (station.social_links ?? []).map(toRow))
  const [saved, setSaved] = useState(() => snapshot(rows))
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const results = rows.map(toLink)
  const dirty = snapshot(rows) !== saved
  const full = rows.length >= MAX_SOCIAL_LINKS
  const used = new Set(rows.flatMap((r) => (r.kind === "platform" ? [r.platform.key] : [])))

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function update(key: string, patch: Partial<{ handle: string; url: string; label: string }>) {
    setRows((all) => all.map((r) => (r.key === key ? ({ ...r, ...patch } as Row) : r)))
  }

  function move(index: number, by: -1 | 1) {
    setRows((all) => {
      const next = [...all]
      ;[next[index], next[index + by]] = [next[index + by], next[index]]
      return next
    })
  }

  async function save() {
    const problem = results.find((r) => typeof r === "string")
    if (problem) {
      toast.error(problem)
      return
    }
    const links = results as SocialLink[]
    setSaving(true)
    try {
      await api.put(`/stations/${station.slug}`, { social_links: links })
      // Pasted addresses come back as handles, so the rows show what was saved.
      const next = links.map(toRow)
      setRows(next)
      setSaved(snapshot(next))
      toast.success("Links saved")
      setOpen(false)
      router.refresh()
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      toast.error(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? "Couldn’t save your links")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsTile
      id="links"
      title="Links on your player page"
      description={
        dirty && !saving ? <span className="text-fault-text">Unsaved changes</span> : summary(rows)
      }
      dialogDescription="Shown as icons on your player page, in this order."
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex flex-col gap-4 text-sm text-foreground">
        {rows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            Nothing here yet. Add the places listeners can follow you.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const Icon = row.kind === "platform"
                ? row.platform.icon
                : (resolveSocialLink({ label: null, url: normalizeSocialUrl(row.url) })?.icon ?? IconWorld)
              const name = row.kind === "platform" ? row.platform.name : "Other link"
              return (
                <li key={row.key} className="flex flex-col gap-2 rounded-well bg-surface-inset p-3">
                  <div className="flex items-center gap-2.5">
                    <Icon aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">{name}</span>
                    <Button size="icon-sm" variant="quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${name} up`}>
                      <IconArrowUp />
                    </Button>
                    <Button size="icon-sm" variant="quiet" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${name} down`}>
                      <IconArrowDown />
                    </Button>
                    <Button size="icon-sm" variant="quiet" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))} aria-label={`Remove ${name}`}>
                      <IconX />
                    </Button>
                  </div>

                  {row.kind === "platform" ? (
                    // The fixed part of the address sits inside the field, so
                    // only the handle is typed; a pasted address is trimmed to it.
                    <label className="flex h-11 min-w-0 items-center rounded-control bg-surface-control pl-3.5 focus-within:ring-2 focus-within:ring-ring">
                      <span className="shrink-0 font-mono text-body-sm text-text-faint">{row.platform.base.replace(/^https:\/\//, "")}</span>
                      <input
                        value={row.handle}
                        onChange={(e) => update(row.key, { handle: e.target.value })}
                        onBlur={(e) => update(row.key, { handle: cleanHandle(row.platform, e.target.value) })}
                        placeholder={row.platform.placeholder}
                        aria-label={`Your ${row.platform.name}`}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={200}
                        className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-sm font-medium outline-none placeholder:text-text-faint"
                      />
                    </label>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={row.url}
                        onChange={(e) => update(row.key, { url: e.target.value })}
                        placeholder="yourstation.com"
                        inputMode="url"
                        autoCapitalize="none"
                        aria-label="Link address"
                        maxLength={2048}
                        // sm: only — flex-1 in the phone's column overrides h-11 and squashes it.
                        className="sm:flex-1"
                      />
                      <Input
                        value={row.label}
                        onChange={(e) => update(row.key, { label: e.target.value })}
                        placeholder="Name (optional)"
                        aria-label="Link name (optional)"
                        maxLength={30}
                        className="sm:w-40"
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="subtle" disabled={full}>
                <IconPlus />
                Add link
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {PICKER_PLATFORMS.map((p) => (
                <DropdownMenuItem
                  key={p.key}
                  disabled={used.has(p.key)}
                  onSelect={() => setRows((all) => [...all, { key: newKey(), kind: "platform", platform: p, handle: "", label: null }])}
                >
                  <p.icon />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setRows((all) => [...all, { key: newKey(), kind: "other", url: "", label: "" }])}>
                <IconWorld />
                Other link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {full && <p className="text-body-sm text-text-faint">{MAX_SOCIAL_LINKS} links is the most a player page shows.</p>}
      </div>
      <DialogFooter>
        <Button size="lg" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </SettingsTile>
  )
}
