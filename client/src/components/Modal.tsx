import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  open: boolean
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

export default function Modal({ title, subtitle, icon, open, onClose, footer, children }: ModalProps) {
  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-10 animate-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-[460px] bg-[#111118] border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_120px_rgba(139,92,246,0.06)] animate-modal-content">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-text-ghost bg-transparent border-none cursor-pointer hover:bg-white/5 hover:text-text-secondary transition-all z-10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header with gradient accent */}
        <div className="relative px-7 pt-7 pb-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[1px] bg-gradient-to-r from-transparent via-violet-full/40 to-transparent" />
          {icon && (
            <div className="w-12 h-12 rounded-xl bg-violet-full/10 border border-violet-full/15 flex items-center justify-center text-violet mb-4">
              {icon}
            </div>
          )}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle && (
            <p className="text-[13px] text-text-muted mt-1">{subtitle}</p>
          )}
        </div>

        {/* Body */}
        <div className="px-7 py-5 flex flex-col gap-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-2.5 px-7 py-5 border-t border-white/[0.06] bg-white/[0.01]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
