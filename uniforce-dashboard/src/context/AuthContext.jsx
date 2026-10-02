import { createContext, useContext, useState, useMemo, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, getMe, setToken, getToken } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, restore session from stored token
  useEffect(() => {
    const restore = async () => {
      const t = getToken()
      if (!t) { setLoading(false); return }
      try {
        const me = await getMe()
        setUser(buildUser(me))
      } catch {
        setToken(null)
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  const login = async (email, password) => {
    const res = await apiLogin(email, password)
    if (res.accessToken) {
      const me = await getMe()
      const u = buildUser(me)
      setUser(u)
      return res
    }
    throw new Error('Login failed — no access token returned.')
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
  }

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

// Build a normalized user object from the /api/auth/me response.
// Roles come from the JWT — never from frontend mock data.
function buildUser(me) {
  return {
    id: me.userId,
    email: me.email,
    name: me.fullName,
    roles: me.roles || [],
    // Convenience: primary role for display
    role: (me.roles && me.roles[0]) || 'User',
    studentOrStaffId: me.studentOrStaffId,
    avatarUrl: me.avatarUrl,
    isActive: me.isActive,
  }
}
