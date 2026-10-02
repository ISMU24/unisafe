import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { SectionHeader, TableHeader, DutyPill, LoadingBlock, ErrorBanner } from '../components/UniForceUI.jsx'
import { subscribePersonnel, subscribeUsers, getUsers } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { ADMIN_ROLES, hasAnyRole } from '../utils/roles.js'
import { teal, red } from '../services/mockData.js'

export default function Users() {
  const [personnel, setPersonnel] = useState([])
  const [users,     setUsers]     = useState([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const { user } = useAuth()

  // GET /api/users is ADMIN/ICT_ADMIN only on the server, so only subscribe
  // when the signed-in account can actually read it. Otherwise the page would
  // show a permanent error for every officer.
  const isAdmin = hasAnyRole(user?.roles, ADMIN_ROLES)

  useEffect(() => {
    const unsubP = subscribePersonnel(
      (rows) => { setPersonnel(rows); setLoading(false) },
      (err) => { setError(err ? err.message : null); setLoading(false) }
    )
    const unsubU = isAdmin
      ? subscribeUsers(
          (rows) => setUsers(rows),
          (err) => { if (err) setError(err.message) }
        )
      : () => {}
    return () => { unsubP(); unsubU() }
  }, [isAdmin])

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.id?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader title="Personnel & users" sub="Duty roster and registered campus members" />
      {error && <ErrorBanner message={error} onRetry={async () => { try { setUsers(await getUsers()); setError(null) } catch (err) { setError(err.message) } }} />}

      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Manage personnel</div>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <TableHeader cols={['Name', 'Role', 'Status', 'Active cases']} widths="1.5fr 1fr 1fr 1fr" />
        {loading && <LoadingBlock label="Loading roster…" />}
        {!loading && !personnel.length && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>No responders registered yet.</div>
        )}
        {personnel.map(p => (
          <div key={p.docId} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.role}</span>
            <DutyPill status={p.status} />
            <span style={{ fontSize: 12, color: 'var(--text)' }}>{p.cases}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>User management</div>
      {!isAdmin ? (
        <div style={{
          padding: '18px 14px', borderRadius: 12, border: '1px solid var(--border)',
          background: 'var(--bg2)', fontSize: 12.5, color: 'var(--text-muted)',
        }}>
          The full campus user directory is restricted to administrators. You are signed in as{' '}
          <strong style={{ color: 'var(--text)' }}>{user?.role}</strong>.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', maxWidth: 300 }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              placeholder="Search by name or ID"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 12, width: '100%', background: 'transparent', color: 'var(--text)' }}
            />
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <TableHeader cols={['Name', 'ID', 'Role', 'Campus', 'Status']} widths="1.5fr 1fr 1fr 1fr 1fr" />
            {!filteredUsers.length && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>No users match that search.</div>
            )}
            {filteredUsers.map(u => (
              <div key={u.docId} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{u.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.student_or_staff_id || u.id}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.role}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.campus || 'Taraka Campus'}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: u.is_active ? teal : red,
                  background: u.is_active ? '#E4F2EC' : '#FBEAE7',
                  padding: '3px 9px', borderRadius: 20, width: 'fit-content',
                }}>{u.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
