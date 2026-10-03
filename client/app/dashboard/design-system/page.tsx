import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Gallery } from "./Gallery"

export const metadata: Metadata = { title: "Design system" }

/**
 * Every components/ds piece in every state, for reviewing the kit in the
 * real shell. Development only: a production build answers 404.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <Gallery />
}
