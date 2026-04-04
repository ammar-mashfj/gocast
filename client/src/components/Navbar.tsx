import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_LINKS = [
  { label: 'How it works', href: '#features' },
  { label: 'Live now', href: '#live' },
  { label: 'Pricing', href: '#pricing' },
] as const

interface NavbarProps {
  onOpenRegister: () => void
  onOpenLogin: () => void
}

export default function Navbar({ onOpenRegister, onOpenLogin }: NavbarProps) {
  const { user, logout } = useAuth()

  return (
    <nav className="flex items-center justify-between px-10 py-5 relative z-10">
      <Link to="/" className="text-xl font-medium -tracking-wide text-white no-underline">
        Go<span className="text-violet">Cast</span>.fm
      </Link>
      <div className="flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-text-muted text-[13px] no-underline tracking-wide hover:text-white/80 transition-colors"
          >
            {link.label}
          </a>
        ))}

        {user ? (
          <>
            <Link
              to="/dashboard"
              className="text-[13px] text-text-secondary no-underline hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <button
              onClick={logout}
              className="text-text-muted text-[13px] tracking-wide bg-transparent border-none cursor-pointer hover:text-white/80 transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onOpenLogin}
              className="text-text-muted text-[13px] tracking-wide bg-transparent border-none cursor-pointer hover:text-white/80 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={onOpenRegister}
              className="bg-violet text-white border-none px-5 py-2 rounded-lg text-[13px] font-medium cursor-pointer hover:bg-violet-full hover:-translate-y-px transition-all"
            >
              Start broadcasting
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
