import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogTitle } from "./Dialog"

/** jsdom's pointer events drop clientY; a MouseEvent under the pointer name keeps it. */
function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientY: number, timeStamp?: number) {
  const ev = new MouseEvent(type, { bubbles: true, clientY })
  Object.assign(ev, { pointerId: 1 })
  if (timeStamp !== undefined) Object.defineProperty(ev, "timeStamp", { value: timeStamp })
  fireEvent(el, ev)
}

function sheet(onOpenChange: (open: boolean) => void, props: { swipeToClose?: boolean; showCloseButton?: boolean } = {}) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} {...props}>
        <DialogTitle>Edit station</DialogTitle>
      </DialogContent>
    </Dialog>,
  )
  return document.querySelector('[data-slot="ds-dialog-grabber"]')!
}

describe("Dialog sheet: pull down to close", () => {
  it("closes on a long pull from the grabber", () => {
    const onOpenChange = vi.fn()
    const grab = sheet(onOpenChange)
    pointer(grab, "pointerdown", 100, 10)
    pointer(grab, "pointermove", 300)
    pointer(grab, "pointerup", 300, 2000)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("closes on a quick flick", () => {
    const onOpenChange = vi.fn()
    const grab = sheet(onOpenChange)
    pointer(grab, "pointerdown", 100, 10)
    pointer(grab, "pointermove", 140)
    pointer(grab, "pointerup", 140, 50)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("springs back from a short, slow pull", () => {
    const onOpenChange = vi.fn()
    const grab = sheet(onOpenChange)
    pointer(grab, "pointerdown", 100, 10)
    pointer(grab, "pointermove", 130)
    pointer(grab, "pointerup", 130, 2000)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog").style.transform).toBe("")
  })

  it("does nothing on a dialog that can't be dismissed", () => {
    const onOpenChange = vi.fn()
    const grab = sheet(onOpenChange, { showCloseButton: false })
    pointer(grab, "pointerdown", 100, 10)
    pointer(grab, "pointermove", 400)
    pointer(grab, "pointerup", 400, 2000)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("closes a dialog without a × when asked to (the confirms)", () => {
    const onOpenChange = vi.fn()
    const grab = sheet(onOpenChange, { showCloseButton: false, swipeToClose: true })
    pointer(grab, "pointerdown", 100, 10)
    pointer(grab, "pointermove", 400)
    pointer(grab, "pointerup", 400, 2000)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
