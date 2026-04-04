import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Broadcast',
    to: '/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    label: 'Analytics',
    to: '/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M18 20V10" />
        <path d="M12 20V4" />
        <path d="M6 20v-6" />
      </svg>
    ),
  },
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()

  return (
    <aside className="group/sb bg-white/[0.02] border-r border-border-subtle flex flex-col py-4 gap-1.5 w-[56px] hover:w-[180px] transition-all duration-200 overflow-hidden z-10">
      {/* Logo — links to homepage */}
      <NavLink to="/" className="flex items-center gap-3 px-[11px] mb-6 shrink-0 no-underline">
        <div className="w-[34px] h-[34px] shrink-0 rounded-lg bg-violet-subtle flex items-center justify-center text-[15px] font-medium text-violet">
          G
        </div>
        <span className="text-[15px] font-medium text-violet opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          GoCast
        </span>
      </NavLink>

      {/* Nav items */}
      {NAV_ITEMS.map((item) => {
        const isActive = item.to === '/dashboard'
          ? location.pathname === '/dashboard'
          : location.pathname.startsWith(item.to)

        return (
          <NavLink
            key={item.label}
            to={item.to}
            className={`flex items-center gap-3 mx-[9px] px-[9px] h-[38px] rounded-lg border-none cursor-pointer transition-colors no-underline shrink-0 ${
              isActive
                ? 'bg-violet-full/12 text-violet'
                : 'bg-transparent text-text-ghost hover:text-text-muted'
            }`}
          >
            <div className="w-[18px] h-[18px] shrink-0 flex items-center justify-center">
              {item.icon}
            </div>
            <span className="text-[13px] font-medium opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 whitespace-nowrap">
              {item.label}
            </span>
          </NavLink>
        )
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Avatar */}
      <div className="flex items-center gap-3 px-[12px] shrink-0">
        <div className="w-8 h-8 shrink-0 rounded-full bg-violet-full/12 flex items-center justify-center text-[11px] text-violet-muted font-medium">
          {user ? getInitials(user.name) : '?'}
        </div>
        <span className="text-[13px] text-text-muted opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 whitespace-nowrap truncate">
          {user?.name}
        </span>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="flex items-center gap-3 mx-[9px] px-[9px] h-[38px] rounded-lg border-none cursor-pointer transition-colors bg-transparent text-text-ghost hover:text-red-400 shrink-0"
      >
        <div className="w-[18px] h-[18px] shrink-0 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>
        <span className="text-[13px] font-medium opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          Logout
        </span>
      </button>
    </aside>
  )
}
