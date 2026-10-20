import Navbar from "@/components/homepage/navbar/Navbar"
import Footer from "@/components/homepage/Footer"

/**
 * Help, blog, legal (and the /discover redirect). `data-surface="marketing"`
 * is what app/dashboard.css scopes the design system to, as on the homepage
 * and the auth pages; every older palette token reads its `--ds-*` value
 * inside it, so pages still on those classes take the warm palette too.
 * No page-wide width cap: the sticky header and the footer run edge to edge
 * with their own `max-w-page` inside, and each page caps its own measure.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
