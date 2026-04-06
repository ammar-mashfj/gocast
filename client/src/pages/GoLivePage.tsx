import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '../lib/axios'
import type { Station } from '../types/station'
import { useBroadcast } from '../contexts/BroadcastContext'
import type { BroadcastStepInfo, StepStatus } from '../lib/broadcast'

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function DotIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  const base = 'w-5 h-5 rounded-full flex items-center justify-center shrink-0'
  if (status === 'done') return <div className={`${base} bg-emerald-live/[0.12]`}><CheckIcon /></div>
  if (status === 'active') return <div className={`${base} bg-violet-full/[0.12]`}><DotIcon /></div>
  if (status === 'error') return <div className={`${base} bg-red-500/[0.12]`}><ErrorIcon /></div>
  return <div className={`${base} bg-white/[0.03]`} />
}

function ConnectingView({ steps, error }: { steps: BroadcastStepInfo[]; error: string | null }) {
  return (
    <div className="bg-black/50 rounded-[14px] p-10 flex flex-col items-center text-center">
      {error ? (
        <div className="w-12 h-12 rounded-full bg-red-500/[0.12] border-2 border-red-500/30 flex items-center justify-center mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      ) : (
        <div className="w-12 h-12 rounded-full border-2 border-violet-subtle border-t-violet mb-5 animate-spin-ring" />
      )}

      <h2 className="text-base font-medium text-text-secondary mb-2">
        {error ? 'Connection failed' : 'Going on air...'}
      </h2>
      <p className="text-[13px] text-text-muted mb-5">
        {error || 'Setting up your broadcast'}
      </p>

      <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-2.5 text-[13px] ${
              step.status === 'done' ? 'text-emerald-live'
                : step.status === 'active' ? 'text-violet'
                : step.status === 'error' ? 'text-red-500/70'
                : 'text-text-dim'
            }`}
          >
            <StepIcon status={step.status} />
            {step.errorMessage || step.label}
          </div>
        ))}
      </div>
    </div>
  )
}

interface SuccessViewProps {
  station: Station
  onOpenControls: () => void
}

function SuccessView({ station, onOpenControls }: SuccessViewProps) {
  return (
    <div className="bg-emerald-live/5 border border-emerald-live/15 rounded-[14px] p-8 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-emerald-live/[0.12] flex items-center justify-center mb-4 animate-live-pulse">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 className="text-lg font-medium text-emerald-live mb-1.5">You're on air!</h2>
      <p className="text-[13px] text-text-muted mb-5">
        Your station is now live. Share your link with your audience.
      </p>

      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-card border border-border-faint rounded-lg text-[13px] text-text-muted">
        {new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href}
        <button
          onClick={() => navigator.clipboard.writeText(new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href)}
          className="text-violet-muted text-xs bg-transparent border-none cursor-pointer hover:text-violet"
        >
          Copy
        </button>
      </div>

      <div className="flex gap-2.5 mt-5">
        <button
          onClick={onOpenControls}
          className="px-5 py-2.5 bg-violet text-white border-none rounded-lg text-[13px] cursor-pointer hover:bg-violet-full hover:-translate-y-px transition-all"
        >
          Open broadcaster controls
        </button>
        <button className="px-5 py-2.5 bg-transparent text-text-muted border border-border-light rounded-lg text-[13px] cursor-pointer hover:border-border-hover hover:text-white transition-all">
          Share on social
        </button>
      </div>
    </div>
  )
}

export default function GoLivePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const micDisabled = (location.state as { micDisabled?: boolean })?.micDisabled ?? false
  const { state, steps, error, start } = useBroadcast()
  const [station, setStation] = useState<Station | null>(null)

  // Fetch station info
  useEffect(() => {
    api.get(`/stations/${id}`)
      .then((res) => setStation(res.data.data))
      .catch(() => navigate('/dashboard'))
  }, [id, navigate])

  // Start broadcasting once station is loaded — only once
  const startedRef = useRef(false)
  useEffect(() => {
    if (!station || state !== 'idle' || startedRef.current) return
    startedRef.current = true
    start(station.id, { skipMic: micDisabled })
  }, [station, state, start, micDisabled])

  if (!station) return null

  return (
    <div className="w-full self-stretch flex flex-col gap-6 p-8">
      <div className="text-[10px] tracking-[2.5px] uppercase text-text-ghost">
        {station.name} — Going live
      </div>

      {state === 'live' ? (
        <SuccessView
          station={station}
          onOpenControls={() => navigate(`/dashboard/stations/${id}/studio`)}
        />
      ) : (
        <ConnectingView steps={steps} error={error} />
      )}

      {(state === 'error') && (
        <div className="flex gap-2.5 justify-center">
          <button
            onClick={() => start(station.id)}
            className="px-5 py-2.5 bg-violet text-white border-none rounded-lg text-[13px] cursor-pointer hover:bg-violet-full transition-all"
          >
            Try again
          </button>
          <button
            onClick={() => navigate(`/dashboard/stations/${id}`)}
            className="px-5 py-2.5 bg-transparent text-text-muted border border-border-light rounded-lg text-[13px] cursor-pointer hover:text-white transition-all"
          >
            Go back
          </button>
        </div>
      )}
    </div>
  )
}
