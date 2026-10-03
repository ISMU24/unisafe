import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import DashboardLayout from './layouts/Dashboardlayout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Emergency from './pages/Emergency.jsx'
import Incidents from './pages/Incidents.jsx'
import Analytics from './pages/Analytics.jsx'
import Reports from './pages/Reports.jsx'
import Users from './pages/Users.jsx'
import Profile from './pages/Profile.jsx'
import Settings from './pages/Settings.jsx'
import AITools from './pages/AITools.jsx'
import AuditLogs from './pages/AuditLogs.jsx'
import { LoadingBlock } from './components/UniForceUI.jsx'
import { RESPONDER_ROLES } from './utils/roles.js'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  // Wait for the session restore to finish, otherwise a hard refresh bounces
  // the operator to /login and back before /api/auth/me resolves.
  if (loading) return <LoadingBlock label="Restoring session…" />
  return user ? children : <Navigate to="/login" replace />
}

function RoleRoute({ allow, children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingBlock label="Checking permissions…" />
  if (!user) return <Navigate to="/login" replace />
  const permitted = (user.roles || []).some((r) => allow.includes(String(r).toUpperCase()))
  if (!permitted) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user, logout } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={
        <PrivateRoute>
          <DashboardLayout onLogout={logout} />
        </PrivateRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="emergency" element={<RoleRoute allow={RESPONDER_ROLES}><Emergency /></RoleRoute>} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="analytics" element={<RoleRoute allow={RESPONDER_ROLES}><Analytics /></RoleRoute>} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="ai-tools" element={<AITools />} />
        <Route path="audit-logs" element={<RoleRoute allow={['ADMIN', 'ICT_ADMIN']}><AuditLogs /></RoleRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
