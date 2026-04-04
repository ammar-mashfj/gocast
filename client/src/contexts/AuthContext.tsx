import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import api from '../lib/axios'
import type { User } from '../types/user'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user on mount if token exists
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    api.get('/user')
      .then((res) => setUser(res.data.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((token: string, userData: User) => {
    localStorage.setItem('token', token)
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/logout')
    } finally {
      localStorage.removeItem('token')
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
