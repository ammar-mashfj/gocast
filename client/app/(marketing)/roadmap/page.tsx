import { redirect } from "next/navigation"

// Roadmap is hidden for now — it had drifted out of sync with what's actually
// shipped (it still listed AutoDJ as "coming soon"), and a stale roadmap is
// worse than none. See the corresponding entry in next.config.ts. This
// unconditional redirect is kept as belt-and-braces in case the redirect is
// disabled or bypassed. Git history has the old page if we bring it back.
export default async function RoadmapPage() {
  redirect("/")
}
