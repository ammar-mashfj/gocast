"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import axios from "axios"
import api from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MAX_SOCIAL_LINKS,
  normalizeSocialUrl,
  resolveSocialLink,
  suggestSocialLabel,
} from "@/lib/socialLinks"
import type { Station } from "@/interfaces/Station"

interface Row {
  key: string
  label: string
  url: string
}

/**
 * Where listeners can find the station off GoCast.
 *
 * Saved as one full-list PUT for the same reason the schedule is: the rows
 * carry no identity worth preserving and their order is the array's order, so
 * a diff would be machinery in exchange for nothing.
 *
 * There is no platform picker anywhere in here. The owner pastes a URL and the
 * icon beside the row is read off its hostname — which is also why that icon
 * renders live while they type: the globe is a legitimate outcome, not a
 * failure, and seeing it before saving is what stops it reading as one.
 */
export function LinksEditor({ station }: { station: Station }) {
  const router = useRouter()

  const [rows, setRows] = useState<Row[]>(() =>
    (station.social_links ?? []).map((link, index) => ({
      key: `saved-${index}`,
      label: link.label ?? "",
      url: link.url,
    })),
  )
  const [saving, setSaving] = useState(false)

  const full = rows.length >= MAX_SOCIAL_LINKS

  function update(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  /**
   * Scheme repair happens on blur rather than on every keystroke: prepending
   * "https://" to the first character typed fights the person typing it.
   */
  function normalizeRow(key: string) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, url: normalizeSocialUrl(row.url) } : row)),
    )
  }

  function addRow() {
    setRows((current) => [...current, { key: `new-${Date.now()}`, label: "", url: "" }])
  }

  async function save() {
    // An empty row is how a mis-click looks, not an error worth a red toast —
    // drop it and save the rest.
    const filled = rows.filter((row) => row.url.trim() !== "")
    const links = filled.map((row) => ({
      label: row.label.trim() === "" ? null : row.label.trim(),
      url: normalizeSocialUrl(row.url),
    }))

    // The first thing the server would reject, said before asking it: a 422
    // names "social_links.2.url", which is not a row anyone can count to.
    const broken = links.findIndex((link) => resolveSocialLink(link) === null)

    if (broken !== -1) {
      toast.error(`"${links[broken].url}" doesn't look like a web address.`)

      return
    }

    setSaving(true)

    try {
      await api.put(`/stations/${station.slug}`, { social_links: links })

      // Keep the keys the rows already have. Re-keying them would remount
      // every input to show the same values back, and the only thing that
      // actually changed is a URL that gained its scheme.
      setRows(filled.map((row, index) => ({ ...row, url: links[index].url })))
      toast.success("Links saved")
      router.refresh()
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined

      toast.error(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? "Couldn't save your links")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const resolved = row.url.trim() === "" ? null : resolveSocialLink({ label: null, url: normalizeSocialUrl(row.url) })
          const Icon = resolved?.icon

          return (
            <div key={row.key} className="flex items-center gap-2">
              {/* The answer to "what logo will it use", given before the save
                  rather than after it. */}
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground"
                title={resolved ? resolved.name : undefined}
              >
                {Icon ? <Icon size={18} /> : <span className="text-xs text-text-faint">—</span>}
              </div>
              <Input
                value={row.url}
                onChange={(e) => update(row.key, { url: e.target.value })}
                onBlur={() => normalizeRow(row.key)}
                placeholder="instagram.com/yourstation"
                inputMode="url"
                aria-label="Link address"
                maxLength={2048}
              />
              <Input
                value={row.label}
                onChange={(e) => update(row.key, { label: e.target.value })}
                // Only prefill a label the owner has not written. For a known
                // platform it stays empty on purpose — the glyph is the label,
                // and a redundant "Instagram" underneath it is noise.
                onFocus={() => {
                  if (row.label === "" && !resolved?.known) {
                    update(row.key, { label: suggestSocialLabel(normalizeSocialUrl(row.url)) })
                  }
                }}
                placeholder={resolved?.known ? resolved.name : "Name (optional)"}
                className="w-40 shrink-0"
                aria-label="Link name"
                maxLength={30}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                aria-label="Remove link"
              >
                <IconTrash size={16} />
              </Button>
            </div>
          )
        })}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Add the places listeners can follow you — socials, a homepage,
          wherever your music lives.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={addRow} disabled={full}>
          <IconPlus data-icon="inline-start" />
          Add link
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save links"}
        </Button>
      </div>

      <p className="text-xs text-text-faint">
        {full
          ? `${MAX_SOCIAL_LINKS} links is the most a player page will show.`
          : "We pick the icon from the address. Anything we don't recognise shows a globe with its name next to it."}
      </p>
    </div>
  )
}
