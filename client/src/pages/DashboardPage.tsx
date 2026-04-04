import { useState, useEffect, useCallback } from 'react'
import api from '../lib/axios'
import type { Station } from '../types/station'
import EmptyState from '../components/dashboard/EmptyState'
import StationCard from '../components/dashboard/StationCard'
import CreateStationModal from '../components/CreateStationModal'

export default function DashboardPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    api.get('/stations')
      .then((res) => setStations(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCreated = useCallback((station: Station) => {
    setStations((prev) => [...prev, station])
    setShowCreate(false)
  }, [])

  if (loading) return null

  return (
    <>
      {stations.length === 0 ? (
        <EmptyState onCreateStation={() => setShowCreate(true)} />
      ) : (
        <div className="w-full self-start px-10 py-8 text-left">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-xl font-medium text-text-secondary">Your stations</h1>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet text-white border-none rounded-lg text-[13px] font-medium cursor-pointer hover:bg-violet-full hover:-translate-y-px transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New station
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {stations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </div>
        </div>
      )}

      <CreateStationModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </>
  )
}
