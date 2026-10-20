import { AutoDjTabs } from "@/components/dashboard/autodj/AutoDjSections"

/**
 * Every station page. Its only job: the AutoDJ tab strip (phones and
 * tablets), which lives here rather than in each AutoDJ page so it isn't
 * replaced by the next page's loading skeleton. It renders nothing on the
 * other station pages and nothing from lg up.
 */
export default async function StationLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <>
      <AutoDjTabs slug={slug} />
      {children}
    </>
  )
}
