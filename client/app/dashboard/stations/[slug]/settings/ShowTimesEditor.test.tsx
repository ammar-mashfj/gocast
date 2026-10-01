import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { ShowTimesEditor, type ShowRow } from "./ShowTimesEditor"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

function Harness({ initial, onRows }: { initial: ShowRow[]; onRows: (rows: ShowRow[]) => void }) {
  const [rows, setRows] = useState(initial)
  onRows(rows)
  return <ShowTimesEditor slug="jazz" timezone="Europe/London" rows={rows} setRows={setRows} dirty={false} onSaved={() => {}} />
}

describe("ShowTimesEditor", () => {
  // The chips are Monday-first; stored days are 0 = Sunday. A slip here
  // would move every advertised show by a day.
  it("maps the Monday-first chips to stored days", async () => {
    let latest: ShowRow[] = []
    render(<Harness initial={[{ key: "a", label: "", days: [0], start_time: "20:00" }]} onRows={(r) => (latest = r)} />)

    expect(screen.getByRole("button", { name: "Sunday" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(screen.getByRole("button", { name: "Monday" }))
    expect(latest[0].days).toEqual([0, 1])
  })
})
