import { useLocation, useNavigate } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import NotificationBell from './NotificationBell.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const titles = {
  '/': 'Security Dashboard',
  '/emergency': 'Emergency Dashboard',
  '/incidents': 'View Incidents',
  '/analytics': 'Analytics',
  '/reports': 'Reports & Analytics',
  '/users': 'User Management',
  '/profile': 'Profile',
  '/settings': 'Settings',
}

// "TK" -> "Officer T. Kaupa" initials: first letters of each name word.
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

export default function Navbar({ onToggleSidebar }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const { user } = useAuth()
  const label = user?.name || user?.email || 'Officer'
  const avatar = initials(label)

  return (
    <header className="navbar">
      <button className="toggle-btn" onClick={onToggleSidebar}>☰</button>
      <div className="navbar-title">{titles[pathname] ?? 'Uni-Force'}</div>
      <div className="navbar-actions">
        <button className="theme-toggle" onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
          {dark ? 'Light' : 'Dark'}
        </button>
        <NotificationBell />
        <div className="avatar" onClick={() => navigate('/profile')} title={label}>{avatar}</div>
      </div>
    </header>
  )
}