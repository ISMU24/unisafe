import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { LoadingBlock } from './components/UniForceUI.jsx'
import { RESPONDER_ROLES } from './utils/roles.js'

const DashboardLayout = lazy(() => import('./layouts/Dashboardlayout.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Emergency = lazy(() => import('./pages/Emergency.jsx'))
const Assistance = lazy(() => import('./pages/Assistance.jsx'))
const Incidents = lazy(() => import('./pages/Incidents.jsx'))
const Analytics = lazy(() => import('./pages/Analytics.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Users = lazy(() => import('./pages/Users.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const AITools = lazy(() => import('./pages/AITools.jsx'))
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'))
const RecycleBin = lazy(() => import('./pages/RecycleBin.jsx'))

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
    <Suspense fallback={<LoadingBlock label="Loading page…" />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={
          <PrivateRoute>
            <DashboardLayout onLogout={logout} />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="emergency" element={<RoleRoute allow={RESPONDER_ROLES}><Emergency /></RoleRoute>} />
          <Route path="assistance" element={<RoleRoute allow={RESPONDER_ROLES}><Assistance /></RoleRoute>} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="analytics" element={<RoleRoute allow={RESPONDER_ROLES}><Analytics /></RoleRoute>} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="ai-tools" element={<AITools />} />
          <Route path="audit-logs" element={<RoleRoute allow={['ADMIN', 'ICT_ADMIN']}><AuditLogs /></RoleRoute>} />
          <Route path="recycle-bin" element={<RoleRoute allow={['ADMIN', 'ICT_ADMIN']}><RecycleBin /></RoleRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
