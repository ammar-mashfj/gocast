import { redirect } from "next/navigation"

// Discover is hidden until there's enough live-station volume to make the
// page feel useful — see the corresponding entry in next.config.ts. This
// unconditional redirect is kept as belt-and-braces in case the rewrite is
// disabled or bypassed.
export default async function DiscoverPage() {
  redirect("/")
}
