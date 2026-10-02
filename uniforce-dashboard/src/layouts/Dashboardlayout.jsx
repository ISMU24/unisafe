import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Navbar from '../components/Navbar.jsx'

export default function DashboardLayout({ onLogout }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="layout">
      <Sidebar collapsed={collapsed} onLogout={onLogout} />
      <div className="main-area">
        <Navbar onToggleSidebar={() => setCollapsed(c => !c)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
