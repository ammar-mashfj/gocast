import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog, useConfirm } from "./ConfirmDialog"

describe("ConfirmDialog", () => {
  const base = {
    open: true,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    title: "Delete Night Shift Radio?",
    confirmLabel: "Delete forever",
    keepLabel: "Keep station",
  }

  it("names what you keep instead of Cancel", () => {
    render(<ConfirmDialog {...base} />)
    expect(screen.getByRole("button", { name: "Keep station" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull()
  })

  it("keeps a danger confirm disabled until the text is typed (any case)", async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...base} tone="danger" confirmText="night-shift" onConfirm={onConfirm} consequences={["Breaks its links"]} />)
    const confirm = screen.getByRole("button", { name: "Delete forever" })
    expect(confirm).toBeDisabled()
    expect(screen.getByText("Breaks its links")).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/to confirm/), "Night-Shif")
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/to confirm/), "t")
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it("can't be dismissed while busy", async () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog {...base} busy onOpenChange={onOpenChange} />)
    expect(screen.getByRole("button", { name: "Keep station" })).toBeDisabled()
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe("useConfirm", () => {
  function Harness({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
    const [confirm, dialog] = useConfirm()
    return (
      <>
        <button onClick={async () => onAnswer(await confirm({ title: "Delete it?", confirmLabel: "Delete track", keepLabel: "Keep it" }))}>
          ask
        </button>
        {dialog}
      </>
    )
  }

  it("resolves true on confirm and false on keep", async () => {
    const onAnswer = vi.fn()
    render(<Harness onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole("button", { name: "ask" }))
    await userEvent.click(await screen.findByRole("button", { name: "Delete track" }))
    expect(onAnswer).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole("button", { name: "ask" }))
    await userEvent.click(await screen.findByRole("button", { name: "Keep it" }))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
  })
})
