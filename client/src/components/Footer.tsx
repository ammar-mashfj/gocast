const FOOTER_LINKS = ['Terms', 'Privacy', 'Status', 'GitHub', 'Twitter'] as const

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle px-10 py-8 flex items-center justify-between">
      <div className="text-xs text-text-ghost">
        GoCast.fm {new Date().getFullYear()}
      </div>
      <div className="flex gap-6">
        {FOOTER_LINKS.map((label) => (
          <a
            key={label}
            href="#"
            className="text-xs text-text-ghost no-underline hover:text-text-muted transition-colors"
          >
            {label}
          </a>
        ))}
      </div>
    </footer>
  )
}
