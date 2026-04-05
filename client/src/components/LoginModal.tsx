import { useState, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
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
import { IconBrandGoogleFilled } from '@tabler/icons-react'

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
  const formRef = useRef<HTMLFormElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const { data } = await api.post('/login', { email, password })
      login(data.token, data.data)
      toast.success('Signed in successfully')
      onClose()
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof AxiosError) {
        toast.error(err.response?.data?.message || 'Invalid credentials')
      } else {
        toast.error('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="bg-[#111118] border-white/[0.08] sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-white">Welcome back</DialogTitle>
          <DialogDescription className="text-[13px] text-text-muted">
            Sign in to your account
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <input type="submit" hidden />

          <div className="flex flex-col gap-1.5">
            <label className="text-[13]px text-text-faint tracking-wide uppercase font-medium">Email</label>
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
              <label className="text-[13px] text-text-faint tracking-wide uppercase font-medium">Password</label>
              <button type="button" className="text-[13px] text-violet bg-transparent border-none cursor-pointer hover:text-violet transition-colors">
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
            <span className="text-[13]px text-text-ghost tracking-wide">Or continue with</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-[13px] text-text-muted no-underline hover:bg-white/[0.06] hover:text-white/70 hover:border-white/[0.12] transition-all"
          >
            <IconBrandGoogleFilled />
            Continue with Google
          </a>

          <div className="text-center mt-1 text-text-ghost">
            <span className='me-1 text-sm'>
              Don't have an account?
            </span>

            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-violet bg-transparent border-none cursor-pointer hover:text-violet text-sm font-medium"
            >
              Register
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
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
