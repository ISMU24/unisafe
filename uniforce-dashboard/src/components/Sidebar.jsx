import { NavLink } from "react-router-dom";
import { Shield, LayoutGrid, FileWarning, Radio, Users, BarChart3, UserCog, LogOut, Sparkles, ClipboardList } from "lucide-react";
import { ink } from "../services/mockData.js";
import { useAuth } from "../context/AuthContext.jsx";
import { RESPONDER_ROLES, ADMIN_ROLES, roleLabel } from "../utils/roles.js";

const navItems = [
  { to: "/", icon: LayoutGrid, label: "Dashboard", end: true },
  { to: "/emergency", icon: Radio, label: "Emergency dashboard", allow: RESPONDER_ROLES },
  { to: "/incidents", icon: FileWarning, label: "View incidents" },
  { to: "/reports", icon: BarChart3, label: "Reports & analytics", allow: RESPONDER_ROLES },
  { to: "/users", icon: UserCog, label: "User management" },
  { to: "/ai-tools", icon: Sparkles, label: "AI Tools" },
  { to: "/audit-logs", icon: ClipboardList, label: "Audit Logs", allow: ADMIN_ROLES },
];

// "Officer T. Kaupa" -> "TK"; "Steven Namaliu" -> "SN"
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

export default function Sidebar({ collapsed, onLogout }) {
  const { user } = useAuth()
  const name = user?.name || 'Officer'
  const role = roleLabel(user?.roles, user?.role)
  const avatar = initials(name)
  const visibleItems = navItems.filter(
    (item) => !item.allow || (user?.roles || []).some((r) => item.allow.includes(String(r).toUpperCase()))
  )

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-logo">
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Shield size={15} color={ink} />
        </div>
        <span>UNI-FORCE</span>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icon size={16} className="nav-icon" style={{ flexShrink: 0 }} />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "var(--text)", flexShrink: 0 }}>{avatar}</div>
          <div className="nav-label">
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{name}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{role}</div>
          </div>
        </div>
        <button className="nav-item" style={{ border: "none", background: "none", width: "100%" }} onClick={onLogout}>
          <LogOut size={16} style={{ flexShrink: 0 }} />
          <span className="nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}