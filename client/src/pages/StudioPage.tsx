import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBroadcast } from '../contexts/BroadcastContext'
import NowPlaying from '../components/studio/NowPlaying'
import TransportControls from '../components/studio/TransportControls'
import PushToTalk from '../components/studio/PushToTalk'
import FileQueue from '../components/studio/FileQueue'
import StreamPanel from '../components/studio/StreamPanel'

export default function StudioPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state } = useBroadcast()
  const wasLive = useRef(false)

  useEffect(() => {
    if (state === 'live') wasLive.current = true
    if (state === 'idle' && wasLive.current) {
      navigate(`/dashboard/stations/${id}`, { replace: true })
    }
    // Fresh page load with no broadcast state — redirect to go live page
    if (state === 'idle' && !wasLive.current) {
      navigate(`/dashboard/stations/${id}/live`, { replace: true })
    }
  }, [state, id, navigate])

  useEffect(() => {
    if (state !== 'live') return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state])

  if (state !== 'live') return null

  return (
    <div className="w-full h-full self-stretch grid grid-cols-[1fr_300px] min-h-0">
      <div className="p-5 flex flex-col gap-3.5 overflow-y-auto">
        <NowPlaying />
        <TransportControls />
        <PushToTalk />
        <FileQueue />
      </div>
      <StreamPanel stationId={id!} />
    </div>
  )
}
