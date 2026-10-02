import { useState } from 'react'
import DashboardCard from '../components/DashboardCard.jsx'

export default function Settings() {
  const [settings, setSettings] = useState({
    emailAlerts: true,
    smsAlerts: true,
    emergencyPush: true,
    anonymousReports: true,
    autoAssign: true,
    mapRefresh: '30',
    timezone: 'Pacific/Port_Moresby',
    language: 'en',
  })

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }))
  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const Toggle = ({ k }) => (
    <div
      onClick={() => toggle(k)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: settings[k] ? 'var(--accent)' : 'var(--bg3)',
        border: '1px solid var(--border)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: settings[k] ? 22 : 3,
        width: 16, height: 16, borderRadius: '50%', background: 'var(--bg2)',
        transition: 'left 0.2s',
      }} />
    </div>
  )

  const ToggleRow = ({ key: k, label, desc }) => (
    <div className="flex justify-between items-center" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ color: 'var(--text)', fontSize: 14 }}>{label}</div>
        <div className="text-muted text-sm">{desc}</div>
      </div>
      <Toggle k={k} />
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div><h2>Settings</h2><p>Configure system preferences</p></div>
      </div>

      <div className="grid-2">
        <DashboardCard title="Notifications">
          {[
            { key: 'emailAlerts', label: 'Email Alerts', desc: 'Receive incident alerts via institutional email' },
            { key: 'smsAlerts', label: 'SMS Alerts', desc: 'Receive critical alerts via SMS (Digicel / bmobile)' },
            { key: 'emergencyPush', label: 'Emergency Push', desc: 'Push notifications for SOS and emergency alerts' },
            { key: 'anonymousReports', label: 'Anonymous Report Notifications', desc: 'Notify officers of new anonymous submissions' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex justify-between items-center" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ color: 'var(--text)', fontSize: 14 }}>{label}</div>
                <div className="text-muted text-sm">{desc}</div>
              </div>
              <Toggle k={key} />
            </div>
          ))}
        </DashboardCard>

        <DashboardCard title="Operations">
          {[
            { key: 'autoAssign', label: 'Auto-Assign Responder', desc: 'Automatically assign nearest available officer to new incidents' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex justify-between items-center" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ color: 'var(--text)', fontSize: 14 }}>{label}</div>
                <div className="text-muted text-sm">{desc}</div>
              </div>
              <Toggle k={key} />
            </div>
          ))}

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Map Refresh Interval (seconds)</label>
            <select className="form-select" value={settings.mapRefresh} onChange={e => set('mapRefresh', e.target.value)}>
              <option value="10">10s</option>
              <option value="30">30s</option>
              <option value="60">60s</option>
              <option value="120">2 min</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Timezone</label>
            <select className="form-select" value={settings.timezone} onChange={e => set('timezone', e.target.value)}>
              <option value="Pacific/Port_Moresby">Port Moresby (PGT, UTC+10)</option>
              <option value="Pacific/Bougainville">Bougainville (BST, UTC+11)</option>
            </select>
          </div>
        </DashboardCard>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary">Save Settings</button>
      </div>
    </>
  )
}
