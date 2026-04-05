import { useState, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import { useAuth } from '../contexts/AuthContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

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
  const formRef = useRef<HTMLFormElement>(null)
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="bg-[#111118] border-white/[0.08] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-white">Start broadcasting for free</DialogTitle>
          <DialogDescription className="text-[13px] text-text-muted">
            Create your account and go live in 60 seconds
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <input type="submit" hidden />
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

          <div className="text-center mt-1 text-sm text-text-ghost">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-violet bg-transparent border-none cursor-pointer hover:text-violet text-sm font-medium"
            >
              Sign in
            </button>
          </div>
        </form>

        <DialogFooter className="border-t border-white/[0.06] pt-5">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-border-faint text-text-muted bg-transparent hover:bg-white/[0.04] hover:text-white/60"
          >
            Cancel
          </Button>
          <Button
            onClick={() => formRef.current?.requestSubmit()}
            disabled={loading}
            className="bg-violet text-white hover:bg-violet-full hover:-translate-y-px"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
