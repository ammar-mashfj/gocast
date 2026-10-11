import { describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Segmented } from "./Segmented"
import { Switch, SwitchRow } from "./Switch"
import { PasswordField, TextField } from "./Field"
import { DayToggle } from "./DayToggle"
import { Disclosure } from "./Disclosure"
import { SegmentBar, ProgressBar } from "./Progress"
import { CopyField } from "./CopyField"
import { ActionRow, List, ListRow } from "./List"
import { Stat } from "./Stat"

describe("Segmented", () => {
  function Harness() {
    const [v, setV] = useState<"7d" | "30d" | "90d">("30d")
    return <Segmented aria-label="Range" value={v} onChange={setV} options={["7d", "30d", "90d"]} />
  }

  // Arrow keys (Radix roving focus) need a real browser; checked in the
  // gallery with Playwright, not here.
  it("is a radio group with one choice", async () => {
    render(<Harness />)
    expect(screen.getByRole("radiogroup", { name: "Range" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "30d" })).toBeChecked()
    await userEvent.click(screen.getByRole("radio", { name: "7d" }))
    expect(screen.getByRole("radio", { name: "7d" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "30d" })).not.toBeChecked()
  })
})

describe("Switch", () => {
  it("toggles, and the row's words are its label", async () => {
    const onChange = vi.fn()
    render(<SwitchRow title="Play jingles" checked={false} onCheckedChange={onChange} />)
    await userEvent.click(screen.getByText("Play jingles"))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("switch", { name: "Play jingles" })).not.toBeChecked()
  })

  it("draws the mic in red", () => {
    render(<Switch tone="live" checked aria-label="Keep mic open" />)
    expect(screen.getByRole("switch").className).toContain("data-[state=checked]:bg-live")
  })
})

describe("TextField", () => {
  it("labels its input and announces an error", () => {
    render(<TextField label="Email" defaultValue="maya@" error="That doesn't look like an email." />)
    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("That doesn't look like an email.")
    expect(screen.getByRole("alert")).toHaveTextContent("That doesn't look like an email.")
  })

  it("uses the hint as its description when there is no error", () => {
    render(<TextField label="Name" hint="Shown on your player page." />)
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Shown on your player page.")
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("DayToggle", () => {
  it("returns sorted day indexes", async () => {
    const onChange = vi.fn()
    render(<DayToggle aria-label="Days" value={[4]} onChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: "Mon" }))
    expect(onChange).toHaveBeenCalledWith([0, 4])
  })
})

describe("Disclosure", () => {
  it("hides its content until opened", async () => {
    render(<Disclosure title="Why can't anyone hear me?">Pick Icecast 2.</Disclosure>)
    expect(screen.queryByText("Pick Icecast 2.")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: /hear me/ }))
    expect(screen.getByText("Pick Icecast 2.")).toBeVisible()
  })

  it("keeps a nested question closed when its parent opens", async () => {
    render(
      <Disclosure title="Use your own DJ software" variant="card">
        <Disclosure title="Shoutcast doesn't work?">Pick Icecast 2.</Disclosure>
      </Disclosure>,
    )
    await userEvent.click(screen.getByRole("button", { name: /DJ software/ }))
    expect(screen.getByRole("button", { name: /Shoutcast/ })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Pick Icecast 2.")).toBeNull()
  })
})

describe("PasswordField", () => {
  it("shows and hides what was typed", async () => {
    render(<PasswordField label="New password" defaultValue="hunter22" />)
    const input = screen.getByLabelText("New password")
    expect(input).toHaveAttribute("type", "password")
    await userEvent.click(screen.getByRole("button", { name: "Show new password" }))
    expect(input).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide new password" })).toHaveAttribute("aria-pressed", "true")
  })
})

describe("Progress", () => {
  it("reports steps and clamps a share", () => {
    render(
      <>
        <SegmentBar done={4} total={6} />
        <ProgressBar value={1.4} label="Storage used" />
      </>,
    )
    expect(screen.getByRole("progressbar", { name: "4 of 6 done" })).toHaveAttribute("aria-valuenow", "4")
    expect(screen.getByRole("progressbar", { name: "Storage used" })).toHaveAttribute("aria-valuenow", "100")
  })
})

describe("CopyField", () => {
  it("copies the full value and says so", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    render(<CopyField label="Station link" value="https://gocast.fm/x" display="gocast.fm/x" />)
    await user.click(screen.getByRole("button", { name: "Copy station link" }))
    expect(writeText).toHaveBeenCalledWith("https://gocast.fm/x")
    expect(screen.getByRole("button", { name: "Copy station link" })).toHaveTextContent("Copied")
  })

  it("falls back to the old copy when the clipboard is blocked", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"))
    const exec = vi.fn().mockReturnValue(true)
    document.execCommand = exec
    render(<CopyField label="Station link" value="https://gocast.fm/x?utm_source=owner" display="gocast.fm/x" />)
    await user.click(screen.getByRole("button", { name: "Copy station link" }))
    expect(exec).toHaveBeenCalledWith("copy")
    expect(screen.getByRole("button", { name: "Copy station link" })).toHaveTextContent("Copied")
  })

  it("shows the whole value, selected, when nothing can copy", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"))
    document.execCommand = vi.fn().mockReturnValue(false)
    render(<CopyField label="Station link" value="https://gocast.fm/x?utm_source=owner" display="gocast.fm/x" />)
    await user.click(screen.getByRole("button", { name: "Copy station link" }))
    expect(screen.getByRole("button", { name: "Copy station link" })).toHaveTextContent("Copy it yourself")
    const field = screen.getByRole("textbox", { name: "Station link" }) as HTMLInputElement
    expect(field.value).toBe("https://gocast.fm/x?utm_source=owner")
    expect(field.selectionEnd).toBe(field.value.length)
  })
})

describe("rows and stats", () => {
  it("renders a list, a link row and a stat", () => {
    render(
      <>
        <List>
          <ListRow title="Thu · 21:04" meta="From this browser" trailing="1h 12m" />
        </List>
        <ActionRow title="Add station artwork" href="/settings" />
        <Stat label="Peak" value="23" sub="+4" trend="up" />
      </>,
    )
    expect(screen.getByRole("listitem")).toHaveTextContent("1h 12m")
    expect(screen.getByRole("link", { name: /Add station artwork/ })).toHaveAttribute("href", "/settings")
    expect(screen.getByText("+4").className).toContain("text-ok")
  })
})
