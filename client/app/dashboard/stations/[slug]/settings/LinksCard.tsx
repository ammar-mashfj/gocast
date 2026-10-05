"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import type { SocialLink, Station } from "@/interfaces/Station"
import { MAX_SOCIAL_LINKS, normalizeSocialUrl, resolveSocialLink } from "@/lib/socialLinks"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { Input } from "@/components/ds/Field"

/**
 * Where listeners can find the station off GoCast, shown on the player page.
 *
 * Paste an address and press Add (or Enter): it saves straight away, and so
 * does Remove. There's no name field: the icon and name come from the address
 * (a globe and the site's name for anything we don't recognise). A name saved
 * before this card existed is kept, because every save sends the whole list
 * back as it was.
 *
 * Saved as one full-list PUT: the links have no ids, and their order is the
 * array's order.
 */
export function LinksCard({ station }: { station: Station }) {
  const router = useRouter()
  const [links, setLinks] = useState<SocialLink[]>(station.social_links ?? [])
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  const full = links.length >= MAX_SOCIAL_LINKS

  async function save(next: SocialLink[], done: string): Promise<boolean> {
    setSaving(true)
    try {
      await api.put(`/stations/${station.slug}`, { social_links: next })
      setLinks(next)
      toast.success(done)
      router.refresh()
      return true
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      toast.error(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? "Couldn’t save your links")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function add() {
    const url = normalizeSocialUrl(draft)
    if (url === "") return
    // Said before asking the server, whose 422 would name "social_links.3.url".
    if (resolveSocialLink({ label: null, url }) === null) {
      toast.error(`“${draft.trim()}” doesn’t look like a web address.`)
      return
    }
    if (links.some((l) => l.url === url)) {
      toast.error("That link is already on your player page.")
      return
    }
    if (await save([...links, { label: null, url }], "Link added")) setDraft("")
  }

  return (
    <Card id="links">
      <CardHeader title="Links on your player page" />

      {links.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          Nothing here yet. Add the places listeners can follow you — socials, a homepage, wherever your music lives.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((link, i) => {
            const resolved = resolveSocialLink(link)
            const Icon = resolved?.icon
            return (
              <li key={`${link.url}-${i}`} className="flex items-center gap-3 rounded-control bg-surface-inset py-1.5 pr-1.5 pl-3.5">
                {Icon && <Icon aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm font-semibold">{resolved?.name ?? link.url}</span>
                  <span className="truncate font-mono text-caption text-text-faint">{link.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={saving}
                  onClick={() => save(links.filter((_, j) => j !== i), "Link removed")}
                  aria-label={`Remove ${resolved?.name ?? link.url}`}
                >
                  Remove
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {full ? (
        <p className="text-body-sm text-text-faint">{MAX_SOCIAL_LINKS} links is the most a player page shows. Remove one to add another.</p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="instagram.com/yourstation"
            inputMode="url"
            aria-label="Link address"
            maxLength={2048}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="subtle" disabled={saving || draft.trim() === ""}>
            {saving ? "Saving…" : "Add"}
          </Button>
        </form>
      )}
    </Card>
  )
}
