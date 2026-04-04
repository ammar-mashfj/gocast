import { useEffect } from 'react'
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

  useEffect(() => {
    if (state === 'idle') {
      navigate(`/dashboard/stations/${id}`, { replace: true })
    }
  }, [state, id, navigate])

  if (state !== 'live') return null

  return (
    <div className="w-full self-stretch grid grid-cols-[1fr_280px] min-h-0">
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
