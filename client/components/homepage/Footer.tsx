import Link from "next/link"
import Image from "next/image"
import { IconBrandX, IconBrandFacebook, IconMail } from "@tabler/icons-react"

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "Roadmap", href: "/roadmap" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
]

const SOCIALS = [
  { icon: IconBrandX, href: "https://x.com/gocastfm", label: "X" },
  { icon: IconBrandFacebook, href: "https://www.facebook.com/gocast.fm/", label: "Facebook" },
  { icon: IconMail, href: "mailto:hello@gocast.fm", label: "Email" },
]

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle px-4 md:px-10 py-6 md:py-8 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center">
          <Image src="/logo.svg" alt="GoCast" width={75} height={75} />
          <span className="ms-2 text-sm">{new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-2">
          {SOCIALS.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <social.icon size={16} />
            </a>
          ))}
        </div>
      </div>
      <div className="flex gap-6">
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="text-xs text-muted-foreground no-underline hover:text-foreground transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
