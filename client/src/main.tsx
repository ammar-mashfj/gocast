import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { BroadcastProvider } from './contexts/BroadcastContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BroadcastProvider>
          <App />
        </BroadcastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
