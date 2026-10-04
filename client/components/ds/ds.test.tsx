import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Button } from "./Button"
import { StatusLamp } from "./StatusLamp"
import { StatusBand } from "./StatusBand"

describe("Button", () => {
  it("renders a link with its dot when asChild", () => {
    render(
      <Button asChild dot="live">
        <a href="/live">Go live</a>
      </Button>,
    )
    const link = screen.getByRole("link", { name: "Go live" })
    expect(link).toHaveAttribute("href", "/live")
    expect(link.querySelector(".bg-live")).not.toBeNull()
  })

  it("lets a call site's class win over the variant", () => {
    render(<Button className="h-7.5">Request Pro</Button>)
    const button = screen.getByRole("button")
    expect(button.className).toContain("h-7.5")
    expect(button.className).not.toContain("h-10")
  })
})

describe("StatusLamp", () => {
  it("colours a soft lamp's dot by tone", () => {
    const { container } = render(<StatusLamp tone="onair">On air · AutoDJ</StatusLamp>)
    expect(container.querySelector('[data-tone="onair"] .bg-on-air')).not.toBeNull()
  })

  it("draws a bare lamp in the surrounding colour", () => {
    const { container } = render(<StatusLamp tone="mic" variant="bare">Live · Mic</StatusLamp>)
    expect(container.querySelector(".bg-current")).not.toBeNull()
  })
})

describe("StatusBand", () => {
  it("is a labelled region with its state, message and buttons", () => {
    render(
      <StatusBand tone="warn" label="SILENCE" message="Nothing is going out." meta={<span>3 LISTENING</span>}>
        <button>Open studio</button>
      </StatusBand>,
    )
    const band = screen.getByRole("region", { name: "Station status" })
    expect(band).toHaveAttribute("data-tone", "warn")
    expect(band).toHaveTextContent("SILENCE")
    expect(band).toHaveTextContent("Nothing is going out.")
    expect(band).toHaveTextContent("3 LISTENING")
    expect(screen.getByRole("button", { name: "Open studio" })).toBeInTheDocument()
  })

  it("reads a fault out as an alert, and stays quiet otherwise", () => {
    const { rerender } = render(<StatusBand tone="live" label="LIVE" message="You’re live." />)
    expect(screen.getByRole("alert")).toBeEmptyDOMElement()
    rerender(<StatusBand tone="warn" label="LOSING AUDIO" message="Your connection is losing audio." />)
    expect(screen.getByRole("alert")).toHaveTextContent("LOSING AUDIO. Your connection is losing audio.")
  })
})
