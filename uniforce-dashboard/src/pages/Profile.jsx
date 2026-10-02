import { useState, useEffect } from 'react'
import DashboardCard from '../components/DashboardCard.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { changePassword } from '../api.js'

export default function Profile() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    badge: 'UF-0041',
    role: 'Field Responder',
    unit: 'Taraka Campus',
    phone: '',
  })
  const [saved, setSaved] = useState(false)
  const [readonly, setReadonly] = useState(false)

  // Password form
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwDone, setPwDone] = useState(false)

  // Seed the form from the authenticated user once it loads.
  useEffect(() => {
    if (!user) return
    setForm(f => ({
      ...f,
      name:  user.name  || f.name,
      email: user.email || f.email,
      role:  user.role  || f.role,
      badge: user.studentOrStaffId || f.badge,
      phone: user.phone || f.phone,
    }))
  }, [user])

  // Identity fields are managed by an administrator, so editing here would
  // silently do nothing. Make that explicit instead of faking a success tick.
  const save = (e) => {
    e.preventDefault()
    setReadonly(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    setPwError(null); setPwDone(false)
    if (pw.newPassword !== pw.confirmPassword) {
      setPwError('The new passwords do not match.')
      return
    }
    if (pw.newPassword.length < 8 || !/\d/.test(pw.newPassword)) {
      setPwError('The new password must be at least 8 characters and contain a digit.')
      return
    }
    setPwBusy(true)
    try {
      await changePassword(pw.currentPassword, pw.newPassword)
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPwDone(true)
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwBusy(false)
    }
  }

  const initials = (() => {
    const parts = String(form.name || '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('')
  })()

  return (
    <>
      <div className="page-header">
        <div><h2>Profile</h2><p>Manage your account information</p></div>
      </div>

      <div className="grid-2">
        <DashboardCard title="Personal Information">
          <form onSubmit={save}>
            {[
              { key: 'name', label: 'Full Name' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'phone', label: 'Phone' },
            ].map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                <input className="form-input" type={f.type || 'text'} value={form[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} />
              </div>
            ))}
            <button className="btn btn-primary" type="submit">Save Changes</button>
            {readonly && (
              <p className="text-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                {saved
                  ? 'Profile changes are applied by an administrator. Contact ICT to update these details.'
                  : ''}
              </p>
            )}
          </form>
        </DashboardCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DashboardCard title="Officer Information">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{initials}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{form.name || '—'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{form.role}</div>
              </div>
            </div>
            {[
              { label: 'Badge Number', value: form.badge },
              { label: 'Role', value: form.role },
              { label: 'Campus', value: form.unit },
              { label: 'Department', value: 'Uni-Force Campus Security' },
              { label: 'Institution', value: 'PNG University of Technology' },
            ].map(r => (
              <div key={r.label} className="flex justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="text-muted">{r.label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{r.value}</span>
              </div>
            ))}
          </DashboardCard>

          <DashboardCard title="Change Password">
            <form onSubmit={submitPassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  className="form-input" type="password" placeholder="••••••••" autoComplete="current-password"
                  value={pw.currentPassword}
                  onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  className="form-input" type="password" placeholder="At least 8 characters, with a digit" autoComplete="new-password"
                  value={pw.newPassword}
                  onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  className="form-input" type="password" placeholder="••••••••" autoComplete="new-password"
                  value={pw.confirmPassword}
                  onChange={e => setPw(p => ({ ...p, confirmPassword: e.target.value }))}
                />
              </div>
              {pwError && <p role="alert" style={{ color: 'var(--danger, #C13B2E)', fontSize: 11.5, margin: '0 0 10px' }}>{pwError}</p>}
              {pwDone && <p style={{ color: 'var(--success)', fontSize: 11.5, margin: '0 0 10px' }}>Password updated. Other sessions were signed out.</p>}
              <button className="btn btn-ghost" type="submit" disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </DashboardCard>
        </div>
      </div>
    </>
  )
}
