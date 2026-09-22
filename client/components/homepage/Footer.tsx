import Link from "next/link"
import Image from "next/image"
import { IconBrandX, IconBrandFacebook, IconBrandInstagram } from "@tabler/icons-react"

/*
 * Grouped into labelled columns rather than two clusters pinned to the far
 * edges of a 1200px row. The old shape left the middle third empty and gave
 * the contact addresses nowhere to live except stacked under the nav links,
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

const HEADING = "text-[11px] tracking-[0.2em] uppercase text-text-faint"

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle px-4 md:px-10 py-10 md:py-14">
      <div className="flex flex-col items-center md:items-start md:flex-row md:justify-between gap-10 md:gap-8 text-center md:text-left">
        <div className="flex flex-col items-center md:items-start gap-3.5 max-w-xs">
          <div className="flex items-center">
            <Image src="/logo.svg" alt="GoCast" width={171} height={27} className="h-6 w-auto" />
            <span className="ms-2 text-xs text-text-faint">© {new Date().getFullYear()}</span>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            Live radio for everyone, from a browser tab.
          </p>
          <div className="flex items-center gap-3 mt-1">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="text-text-faint hover:text-white transition-colors"
              >
                <social.icon size={18} />
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center md:justify-end gap-x-14 gap-y-9 lg:gap-x-20">
          {LINK_GROUPS.map((group) => (
            <div key={group.heading} className="flex flex-col items-center md:items-start gap-3">
              <span className={HEADING}>{group.heading}</span>
              {group.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-text-muted no-underline hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}

          <div className="flex flex-col items-center md:items-start gap-3">
            <span className={HEADING}>Contact</span>
            {CONTACTS.map(({ address, hint }) => (
              <div key={address} className="flex flex-col items-center md:items-start gap-0.5">
                <a
                  href={`mailto:${address}`}
                  className="text-sm text-text-secondary no-underline hover:text-white transition-colors"
                >
                  {address}
                </a>
                <span className="text-xs text-text-faint">{hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
