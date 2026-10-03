import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Station } from "@/interfaces/Station"
import { artworkProblem } from "./ArtworkDrop"
import { StationForm } from "./StationForm"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const post = vi.fn()
vi.mock("@/lib/axios", () => ({ default: { post: (...a: unknown[]) => post(...a), put: vi.fn() } }))

const file = (type: string, bytes: number) => new File([new Uint8Array(bytes)], "art", { type })

describe("artworkProblem", () => {
  it("takes a PNG, JPEG or WebP up to 5 MB", () => {
    expect(artworkProblem(file("image/png", 1000))).toBeNull()
    expect(artworkProblem(file("image/webp", 5 * 1024 * 1024))).toBeNull()
  })

  it("refuses other types and anything bigger", () => {
    expect(artworkProblem(file("image/gif", 1000))).toMatch(/PNG, JPEG or WebP/)
    expect(artworkProblem(file("image/jpeg", 5 * 1024 * 1024 + 1))).toMatch(/5 MB/)
  })
})

describe("StationForm", () => {
  it("creates the station and opens it", async () => {
    post.mockResolvedValue({ data: { data: { slug: "night-shift" } } })
    render(<StationForm />)

    const create = screen.getByRole("button", { name: "Create station" })
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByLabelText("Name"), "  Night Shift ")
    await userEvent.click(create)

    expect(post).toHaveBeenCalledWith("/stations", { name: "Night Shift", genre: null, description: null, artwork_url: null })
    expect(push).toHaveBeenCalledWith("/dashboard/stations/night-shift")
  })

  it("shows the link when editing, and never sends it", () => {
    render(<StationForm station={{ slug: "jazz", name: "Jazz", genre: null, description: null, artwork_url: null } as Station} />)
    expect(screen.getByText(/\/station\/jazz · the link never changes/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
  })
})
