import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CreateStation } from "./CreateStation"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/axios", () => ({ default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }))

const previewOf = (slug: string) => ({ data: { data: { slug } } })

describe("CreateStation", () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    push.mockReset()
  })

  it("shows the link the name gets, and creates with the name only", async () => {
    get.mockResolvedValue(previewOf("night-owl-radio"))
    post.mockResolvedValue({ data: { data: { slug: "night-owl-radio" } } })
    render(<CreateStation />)

    expect(screen.getByRole("button", { name: "Create station" })).toBeDisabled()
    expect(screen.getAllByText("your-link")).toHaveLength(1)

    await userEvent.type(screen.getByLabelText("Station name"), "Night Owl Radio ")
    await waitFor(() => expect(screen.getAllByText(/night-owl-radio$/)).toHaveLength(2))
    expect(get).toHaveBeenLastCalledWith("/stations/slug-preview", { params: { name: "Night Owl Radio" } })
    // Nowhere to type the link.
    expect(screen.queryByLabelText("Your link")).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Create Night Owl Radio" }))
    expect(post).toHaveBeenCalledWith("/stations", { name: "Night Owl Radio", genre: null, description: null, artwork_url: null })
    expect(push).toHaveBeenCalledWith("/dashboard/stations/night-owl-radio")
  })

  it("shows the numbered link a taken name gets", async () => {
    get.mockResolvedValue(previewOf("jazz-2"))
    render(<CreateStation />)

    await userEvent.type(screen.getByLabelText("Station name"), "Jazz")
    await waitFor(() => expect(screen.getAllByText(/jazz-2$/)).toHaveLength(2))
    expect(screen.getByRole("button", { name: "Create Jazz" })).toBeEnabled()
  })

  it("drops the previous name's link when the next preview fails", async () => {
    get.mockResolvedValueOnce(previewOf("night-owl")).mockRejectedValue(new Error("429"))
    render(<CreateStation />)

    await userEvent.type(screen.getByLabelText("Station name"), "Night Owl")
    await waitFor(() => expect(screen.getAllByText(/night-owl$/)).toHaveLength(2))

    // Typed on, not cleared: clearing resets the link by itself.
    await userEvent.type(screen.getByLabelText("Station name"), " Show")
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/stations/slug-preview", { params: { name: "Night Owl Show" } }))
    await waitFor(() => expect(screen.getAllByText(/your-link$/)).toHaveLength(2))
    expect(screen.queryByText(/night-owl$/)).toBeNull()
  })

  it("does not wait for the preview to allow creating", async () => {
    get.mockReturnValue(new Promise(() => {}))
    render(<CreateStation />)

    await userEvent.type(screen.getByLabelText("Station name"), "Slow Server FM")
    expect(screen.getByRole("button", { name: "Create Slow Server FM" })).toBeEnabled()
  })

  it("previews the station as a listener would see it", async () => {
    get.mockResolvedValue(previewOf("basement-tapes"))
    render(<CreateStation />)
    const preview = screen.getByRole("complementary", { name: "What listeners see" })
    expect(preview).toHaveTextContent("Your station")
    expect(preview).toHaveTextContent("Off air")

    await userEvent.type(screen.getByLabelText("Station name"), "Basement Tapes")
    await userEvent.click(screen.getByRole("button", { name: "Jazz" }))
    await userEvent.type(screen.getByLabelText("Description"), "Demos and B-sides.")
    expect(preview).toHaveTextContent("Basement Tapes")
    expect(preview).toHaveTextContent("Jazz")
    expect(preview).toHaveTextContent("Demos and B-sides.")
    await waitFor(() => expect(preview).toHaveTextContent("/station/basement-tapes"))
    expect(screen.getByText("18/160")).toBeInTheDocument()
  })
})
