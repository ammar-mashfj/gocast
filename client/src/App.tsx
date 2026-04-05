import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from './contexts/AuthContext'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import StationDetailPage from './pages/StationDetailPage'
import GoLivePage from './pages/GoLivePage'
import StudioPage from './pages/StudioPage'
import PlayerPage from './pages/PlayerPage'
import DashboardLayout from './components/dashboard/DashboardLayout'

function App() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <>
    <Toaster position="top-right" />
    <Routes>
      {/* Public player — must be before catch-all */}
      <Route path="/station/:slug" element={<PlayerPage />} />

      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <HomePage />} />

      <Route path="/dashboard" element={user ? <DashboardLayout /> : <Navigate to="/" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="stations/:id" element={<StationDetailPage />} />
        <Route path="stations/:id/live" element={<GoLivePage />} />
        <Route path="stations/:id/studio" element={<StudioPage />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
    </Routes>
    </>
  )
}

export default App
