import Navbar from "@/components/homepage/navbar/Navbar"
import Footer from "@/components/homepage/Footer"

/**
 * The homepage's own layout, split from `(marketing)` for two reasons:
 *
 *   - it wears the GoCast Design System. `data-surface="marketing"` is what
 *     app/dashboard.css scopes the warm palette, Bricolage body and Plex Mono
 *     to (`:has()` lifts it to <html>, so the navbar, the footer and anything
 *     portalled to <body> wear it too). The (marketing) group and the auth
 *     pages carry the same attribute;
 *   - its sections run edge to edge (the studio and pricing bands fill the
 *     viewport), so there is no page-wide width cap here. Each section caps
 *     its own content at `max-w-page`.
 */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
