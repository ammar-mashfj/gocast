"use client"

import { useState } from "react"
import { IconPlayerPlayFilled } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader, CardLink } from "@/components/ds/Card"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { CopyField } from "@/components/ds/CopyField"
import { DayToggle } from "@/components/ds/DayToggle"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { Disclosure } from "@/components/ds/Disclosure"
import { Input, TextAreaField, TextField } from "@/components/ds/Field"
import { ActionRow, List, ListRow } from "@/components/ds/List"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ds/Menu"
import { PageHeader } from "@/components/ds/PageHeader"
import { ProgressBar, SegmentBar } from "@/components/ds/Progress"
import { Segmented } from "@/components/ds/Segmented"
import { Select } from "@/components/ds/Select"
import { Stat, StatTile } from "@/components/ds/Stat"
import { StatusBand } from "@/components/ds/StatusBand"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Switch, SwitchRow } from "@/components/ds/Switch"
import { ProTag, Tag } from "@/components/ds/Tag"
import type { AirTone } from "@/lib/airState"
import { toast } from "sonner"

const TONES: AirTone[] = ["off", "onair", "live", "mic", "warn"]
const BUTTONS = ["primary", "ghost", "subtle", "quiet", "live", "onair", "onair-soft", "pro", "danger", "danger-quiet"] as const

export function Gallery() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d")
  const [mode, setMode] = useState("Repeat list")
  const [jingles, setJingles] = useState(true)
  const [mic, setMic] = useState(false)
  const [days, setDays] = useState([0, 2, 4])
  const [showDays, setShowDays] = useState([4, 5])
  const [every, setEvery] = useState<string | undefined>("3")
  const [dialog, setDialog] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [danger, setDanger] = useState(false)

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Design system"
        aside={<Tag>dev only</Tag>}
        description="Every piece in components/ds, in the real shell. Pages compose these; they don't style."
        actions={<Button variant="ghost">An action</Button>}
      />

      <Section title="Type">
        <Card>
          <p className="font-display text-hero">Hero 56</p>
          <p className="font-display text-page">Page title 42</p>
          <p className="font-display text-display">Display 34</p>
          <p className="font-display text-title-lg">Title large 30</p>
          <p className="font-display text-title">Title 24 — dialogs</p>
          <p className="font-display text-heading">Heading 18 — card titles</p>
          <p className="text-lead text-muted-foreground">Lead 17 — a page’s description.</p>
          <p className="text-body">Body 15 — the default.</p>
          <p className="text-body-sm text-muted-foreground">Body small 13 — a line under something.</p>
          <p className="text-caption text-text-faint">Caption 12</p>
          <p className="eyebrow text-text-faint">Eyebrow · listening now</p>
          <p className="font-mono text-meter-xl">23</p>
          <p className="font-mono text-meter">02:41</p>
        </Card>
      </Section>

      <Section title="Status">
        <Card>
          {(["solid", "soft"] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap gap-4">
              {TONES.map((t) => (
                <StatusLamp key={t} tone={t} variant={variant}>{t}</StatusLamp>
              ))}
            </div>
          ))}
        </Card>
        <div className="-mx-gutter flex flex-col gap-px overflow-hidden">
          <StatusBand tone="off" label="OFF AIR" message="Nothing’s playing. Nobody can tune in right now.">
            <Button size="sm" variant="onair-soft">Start AutoDJ</Button>
          </StatusBand>
          <StatusBand tone="onair" label="ON AIR · AUTODJ" message="AutoDJ is playing Neon Rain by Koto Blue." meta={<span>12 LISTENING</span>}>
            <Button size="sm">Go live</Button>
          </StatusBand>
          <StatusBand tone="live" label="LIVE" message="You’re live." meta={<span>8 LISTENING</span>}>
            <Button size="sm" variant="live">Open studio</Button>
          </StatusBand>
          <StatusBand tone="mic" label="LIVE · MIC" message="You’re talking. Music dips under you.">
            <Button size="sm" variant="ink">Close mic</Button>
          </StatusBand>
          <StatusBand tone="warn" label="SILENCE" message="Nothing is going out. Press play or hold Space to talk.">
            <Button size="sm" variant="ink">Open studio</Button>
          </StatusBand>
        </div>
      </Section>

      <Section title="Buttons">
        <Card>
          {(["sm", "md", "lg"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2">
              {BUTTONS.map((v) => (
                <Button key={v} size={size} variant={v}>{v}</Button>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" dot="live">Go live now</Button>
            <Button size="xl" variant="live" dot="current">Go live now</Button>
            <Button size="icon" variant="subtle" aria-label="Play"><IconPlayerPlayFilled /></Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>
      </Section>

      <Section title="Surfaces">
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader title="Card" aside={<CardLink href="#">All shows →</CardLink>} />
            <p className="text-body-sm text-muted-foreground">Every section of a page.</p>
            <Card tone="raised" size="sm">Raised — a tile inside a card</Card>
            <Card tone="inset" size="sm">Inset — a well</Card>
          </Card>
          <div className="flex flex-col gap-5">
            <Card tone="onair"><CardHeader title="On air" description="AutoDJ has the station." /></Card>
            <Card tone="live"><CardHeader title="Live" description="Everything on it turns ink." /></Card>
            <Card tone="pro" className="flex-row flex-wrap items-center justify-between">
              <span className="flex items-center gap-2.5"><ProTag /><span className="font-display text-title">You’re on Pro</span></span>
              <Button variant="pro">Manage plan</Button>
            </Card>
            <Card tone="outline" className="flex-row flex-wrap items-center justify-between">
              <span className="flex flex-col gap-1">
                <span className="font-display text-base font-bold">Delete this station</span>
                <span className="text-body-sm text-muted-foreground">The link stops working and every track is removed.</span>
              </span>
              <Button variant="danger-quiet" onClick={() => setDanger(true)}>Delete station…</Button>
            </Card>
          </div>
        </div>
      </Section>

      <Section title="Numbers and progress">
        <Card>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-4">
            <Stat label="On air" value="10h 16m" sub="+4h 7m vs the 14 days before" trend="up" />
            <Stat label="Shows" value="7" sub="about 1h 28m each" />
            <Stat label="Peak" value="23" sub="listening at once, Sep 20" />
          </div>
          <SegmentBar done={4} total={6} />
          <ProgressBar value={0.42} tone="onair" label="Track position" />
          <ProgressBar value={0.97} tone="live" label="Storage used" />
        </Card>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="Listeners" value="148" />
          <StatTile label="Listening time" value="61h" sub="this month" />
        </div>
      </Section>

      <Section title="Rows">
        <Card>
          <CardHeader title="Recent shows" aside={<CardLink href="#">All shows →</CardLink>} />
          <List>
            <ListRow title="Thu · 21:04" meta="From this browser" trailing="1h 12m" />
            <ListRow title="Tue · 20:30" meta="From BUTT" trailing="48m" />
            <ListRow title="Sun · 19:00" meta="From this browser" trailing={<Button size="sm" variant="subtle">Details</Button>} />
          </List>
        </Card>
        <div className="grid gap-2.5 md:grid-cols-2">
          <ActionRow title="Add station artwork" description="Shows on your player page and wherever your link is shared." href="#" />
          <ActionRow title="Add your social links" description="So listeners can follow you between shows." onClick={() => toast("Clicked")} />
        </div>
        <Disclosure title="My encoder says it connected, but nobody hears anything">
          Pick Icecast 2 as the server type. Shoutcast can’t send the mount.
        </Disclosure>
        <Disclosure variant="card" title="Use your own DJ software" description="Optional. Skip this if you go live from the browser.">
          Five values go here.
        </Disclosure>
      </Section>

      <Section title="Inputs">
        <Card>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Station name" defaultValue="Night Shift Radio" />
            <TextField label="Email" defaultValue="maya@" error="That doesn’t look like an email." />
            <TextAreaField label="Description" defaultValue="Late-night soul and slow jams." hint="Shown on your player page." />
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input placeholder="instagram.com/nightshiftradio" aria-label="Link" />
                <Button variant="subtle" className="h-11">Add</Button>
              </div>
              <Select
                aria-label="Jingle frequency"
                value={every}
                onChange={setEvery}
                options={[{ value: "2", label: "Every 2 tracks" }, { value: "3", label: "Every 3 tracks" }, { value: "5", label: "Every 5 tracks" }]}
              />
              <CopyField label="Station link" value="https://gocast.fm/night-shift-radio" display="gocast.fm/night-shift-radio" />
            </div>
          </div>
          <Segmented aria-label="Range" size="sm" value={range} onChange={setRange} options={["7d", "30d", "90d"]} className="w-60" />
          <Segmented aria-label="Repeat" value={mode} onChange={setMode} options={["Repeat list", "Repeat track"]} />
          <div className="flex flex-wrap items-center gap-6">
            <Switch checked={jingles} onCheckedChange={setJingles} aria-label="Jingles" />
            <Switch tone="live" checked={mic} onCheckedChange={setMic} aria-label="Keep mic open" />
          </div>
          <SwitchRow title="Play jingles" description="Changes apply live — you stay on air." checked={jingles} onCheckedChange={setJingles} />
          <DayToggle aria-label="AutoDJ days" value={days} onChange={setDays} />
          <DayToggle aria-label="Show days" tone="live" size="sm" value={showDays} onChange={setShowDays} />
          <div className="flex flex-wrap gap-2">
            <Tag>Soul</Tag>
            <Tag variant="onair">Default</Tag>
            <Tag variant="ok">Saved</Tag>
            <Tag variant="warn">Unsaved changes</Tag>
            <ProTag />
          </div>
        </Card>
      </Section>

      <Section title="Floating">
        <Card className="flex-row flex-wrap">
          <Button variant="ghost" onClick={() => setDialog(true)}>Dialog</Button>
          <Button variant="ghost" onClick={() => setConfirm(true)}>Confirm</Button>
          <Button variant="ghost" onClick={() => setDanger(true)}>Danger confirm</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="muted">Delete playlist</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" onClick={() => toast.success("Link copied")}>Toast</Button>
          <Button variant="ghost" onClick={() => toast.error("Couldn’t save. Try again.")}>Error toast</Button>
        </Card>
      </Section>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit station profile</DialogTitle>
            <DialogDescription>What listeners see on your player page.</DialogDescription>
          </DialogHeader>
          <TextField label="Name" defaultValue="Night Shift Radio" />
          <TextField label="Genre" defaultValue="Soul" />
          <DialogFooter>
            <Button size="lg" onClick={() => setDialog(false)}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        onConfirm={() => setConfirm(false)}
        title="End your show?"
        description="You’ve been on for 1h 12m. AutoDJ takes back the station straight away."
        confirmLabel="End show"
        keepLabel="Keep going"
      />
      <ConfirmDialog
        open={danger}
        onOpenChange={setDanger}
        onConfirm={() => setDanger(false)}
        tone="danger"
        title="Delete Night Shift Radio?"
        description="This is permanent and can’t be undone."
        consequences={["Takes it off air straight away", "Breaks its player page, stream links and embeds"]}
        confirmText="night-shift-radio"
        confirmLabel="Delete forever"
        keepLabel="Keep station"
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow text-text-faint">{title}</h2>
      {children}
    </section>
  )
}
