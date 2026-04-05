const FOOTER_LINKS = ['Terms', 'Privacy', 'Status', 'GitHub', 'Twitter'] as const
import logo from '../assets/logo.svg'
export default function Footer() {
  return (
    <footer className="border-t border-border-subtle px-10 py-8 flex items-center justify-between">
      <div className="flex justify-center items-center">
        <img src={logo} alt="GoCast" className="h-3 w-auto me-3" />
        <span className="text-sm">{new Date().getFullYear()}</span>
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
