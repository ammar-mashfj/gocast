import Link from "next/link"
import { IconBrandFacebook, IconBrandInstagram, IconBrandX } from "@tabler/icons-react"
import { Wordmark } from "@/components/homepage/Wordmark"

/*
 * Grouped into labelled columns rather than two clusters pinned to the far
 * edges of the row. The old shape left the middle third empty and gave the
 * contact addresses nowhere to live except stacked under the nav links,
 * which is why a second address read as an afterthought.
 */
const LINK_GROUPS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Explore",
    links: [
      { label: "Help", href: "/help" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
]

// The descriptor is the point of splitting the addresses at all — two bare
// mailboxes side by side just make the reader guess.
const CONTACTS = [
  { address: "hello@gocast.fm", hint: "Questions and support" },
  { address: "business@gocast.fm", hint: "Partnerships and press" },
]

const SOCIALS = [
  { icon: IconBrandX, href: "https://x.com/gocastfm", label: "X" },
  { icon: IconBrandFacebook, href: "https://www.facebook.com/gocast.fm/", label: "Facebook" },
  { icon: IconBrandInstagram, href: "https://www.instagram.com/gocastfm/", label: "Instagram" },
]

const LINK = "text-sm leading-normal font-medium text-foreground no-underline transition-colors hover:text-muted-foreground"

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid w-full max-w-page gap-8 px-gutter pt-12 pb-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr]">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="text-sm leading-normal font-medium text-muted-foreground">Live radio for everyone, from a browser tab.</p>
          {/* 40px tap targets around 18px icons; the negative margin keeps
              the first icon on the text's edge. */}
          <div className="-ml-2.75 flex items-center">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <social.icon size={18} />
              </a>
            ))}
          </div>
        </div>
        {LINK_GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2.5">
            <span className="eyebrow pb-1 text-text-faint">{group.heading}</span>
            {group.links.map((link) => (
              <Link key={link.label} href={link.href} className={LINK}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow pb-1 text-text-faint">Contact</span>
          {CONTACTS.map(({ address, hint }) => (
            <div key={address} className="flex flex-col gap-0.5">
              <a href={`mailto:${address}`} className={LINK}>
                {address}
              </a>
              <span className="text-body-sm text-text-faint">{hint}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-page px-gutter pb-8 font-mono text-caption text-text-faint">
        © {new Date().getFullYear()} GoCast
      </div>
    </footer>
  )
}
