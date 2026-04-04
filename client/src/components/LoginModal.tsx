import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import { useAuth } from '../contexts/AuthContext'
import Modal from './Modal'

interface LoginModalProps {
  open: boolean
  onClose: () => void
  onSwitchToRegister: () => void
}

const INPUT_CLASS =
  'bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-3 text-sm text-text-secondary font-[inherit] outline-none transition-all focus:border-violet-muted focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)] w-full placeholder:text-text-ghost'

export default function LoginModal({ open, onClose, onSwitchToRegister }: LoginModalProps) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await api.post('/login', { email, password })
      login(data.token, data.data)
      onClose()
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.message || 'Invalid credentials')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const footer = (
    <>
      <button
        onClick={onClose}
        className="px-5 py-2.5 bg-transparent border border-white/[0.08] rounded-lg text-[13px] text-text-muted font-[inherit] cursor-pointer hover:bg-white/[0.04] hover:text-white/60 transition-all"
      >
        Cancel
      </button>
      <button
        onClick={() => {
          const form = document.getElementById('login-form') as HTMLFormElement | null
          form?.requestSubmit()
        }}
        disabled={loading}
        className="px-6 py-2.5 bg-violet border-none rounded-lg text-[13px] font-medium text-white font-[inherit] cursor-pointer hover:bg-violet-full hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(139,92,246,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </>
  )

  const icon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )

  return (
    <Modal
      title="Welcome back"
      subtitle="Sign in to your account"
      icon={icon}
      open={open}
      onClose={onClose}
      footer={footer}
    >
      <form id="login-form" className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-text-faint tracking-wide uppercase font-medium">Email</label>
          <input
            className={INPUT_CLASS}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[11px] text-text-faint tracking-wide uppercase font-medium">Password</label>
            <button type="button" className="text-[11px] text-violet-muted bg-transparent border-none cursor-pointer hover:text-violet transition-colors">
              Forgot?
            </button>
          </div>
          <input
            className={INPUT_CLASS}
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center gap-3.5 my-1">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[11px] text-text-ghost tracking-wide">or continue with</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-[13px] text-text-muted no-underline hover:bg-white/[0.06] hover:text-white/70 hover:border-white/[0.12] transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </a>

        <div className="text-center mt-1 text-xs text-text-ghost">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-violet-muted bg-transparent border-none cursor-pointer hover:text-violet text-xs font-medium"
          >
            Create one free
          </button>
        </div>
      </form>
    </Modal>
  )
}
