import Link from "next/link"
import Image from "next/image"
import { IconBrandX, IconBrandFacebook, IconMail } from "@tabler/icons-react"

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "Roadmap", href: "/roadmap" },
  { label: "Blog", href: "/blog" },
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
    <footer className="border-t border-border-subtle px-4 md:px-10 py-8 md:py-10">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center">
            <Image src="/logo.svg" alt="GoCast" width={171} height={27} className="h-6 w-auto" />
            <span className="ms-2 text-xs text-text-faint">© {new Date().getFullYear()}</span>
          </div>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Live radio for everyone, from a browser tab.
          </p>
          <div className="flex items-center gap-2 mt-1">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target={social.href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
                aria-label={social.label}
                className="text-text-faint hover:text-white transition-colors"
              >
                <social.icon size={16} />
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:items-end gap-3">
          <div className="flex gap-6">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-text-muted no-underline hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="mailto:hello@gocast.fm"
              className="text-sm text-text-faint no-underline hover:text-white transition-colors"
            >
              hello@gocast.fm
            </a>
          </div>

        </div>
      </div>
    </footer>
  )
}
