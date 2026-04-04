import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function DashboardLayout() {
  return (
    <div className="bg-dark-surface text-white font-sans min-h-screen flex">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center relative min-h-screen overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
