import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import { useAuth } from '../contexts/AuthContext'
import Modal from './Modal'

interface RegisterModalProps {
  open: boolean
  onClose: () => void
  onSwitchToLogin: () => void
}

const INPUT_CLASS =
  'bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-3 text-sm text-text-secondary font-[inherit] outline-none transition-all focus:border-violet-muted focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)] w-full placeholder:text-text-ghost'

export default function RegisterModal({ open, onClose, onSwitchToLogin }: RegisterModalProps) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== passwordConfirmation) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const { data } = await api.post('/register', {
        name, email, password, password_confirmation: passwordConfirmation,
      })
      login(data.token, data.data)
      onClose()
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof AxiosError) {
        const errData = err.response?.data
        const fieldError = errData?.errors
          ? Object.values(errData.errors as Record<string, string[]>).flat()[0]
          : null
        setError(fieldError || errData?.message || 'Registration failed')
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
          const form = document.getElementById('register-form') as HTMLFormElement | null
          form?.requestSubmit()
        }}
        disabled={loading}
        className="px-6 py-2.5 bg-violet border-none rounded-lg text-[13px] font-medium text-white font-[inherit] cursor-pointer hover:bg-violet-full hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(139,92,246,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      >
        {loading ? 'Creating account...' : 'Create account'}
      </button>
    </>
  )

  const icon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )

  return (
    <Modal
      title="Start broadcasting for free"
      subtitle="Create your account and go live in 60 seconds"
      icon={icon}
      open={open}
      onClose={onClose}
      footer={footer}
    >
      <form id="register-form" className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-text-faint tracking-wide uppercase font-medium">Name</label>
            <input
              className={INPUT_CLASS}
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-text-faint tracking-wide uppercase font-medium">Password</label>
            <input
              className={INPUT_CLASS}
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-text-faint tracking-wide uppercase font-medium">Confirm</label>
            <input
              className={INPUT_CLASS}
              type="password"
              placeholder="Re-enter password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="text-center mt-1 text-xs text-text-ghost">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-violet-muted bg-transparent border-none cursor-pointer hover:text-violet text-xs font-medium"
          >
            Sign in
          </button>
        </div>
      </form>
    </Modal>
  )
}
