import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { SectionHeader, StatusPill, LoadingBlock, ErrorBanner } from '../components/UniForceUI.jsx'
import { subscribeSOSEvents, updateSOSStatus } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { RESPONDER_ROLES, hasAnyRole } from '../utils/roles.js'
import { CATEGORY, red } from '../services/mockData.js'

const ACTIVE_STATUSES = ['Active', 'Acknowledged', 'Responding']

export default function Emergency() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const { user } = useAuth()

  const canRespond = hasAnyRole(user?.roles, RESPONDER_ROLES)

  useEffect(() => {
    const stop = subscribeSOSEvents(
      (rows) => { setEvents(rows); setLoading(false); setError(null) },
      {},
      (err) => { setError(err ? err.message : null); setLoading(false) }
    )
    return stop
  }, [])

  const active = events.filter(e => ACTIVE_STATUSES.includes(e.status))

  async function changeStatus(event, status, note) {
    setBusyId(event.docId); setActionError(null)
    try {
      await updateSOSStatus(event.docId, status, note)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader title="Emergency dashboard" sub="Incoming SOS alerts requiring immediate dispatch" />
      {error && <ErrorBanner message={error} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && <LoadingBlock label="Listening for SOS alerts…" />}
      {!loading && active.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>No active alerts at this time.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.map(e => {
          const busy = busyId === e.docId
          return (
            <div key={e.docId} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--bg2)',
              border: `1px solid ${e.status === 'Active' ? red : 'var(--border)'}`,
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: CATEGORY.Security.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CATEGORY.Security.icon size={19} color={CATEGORY.Security.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-muted)' }}>{String(e.id).slice(0, 8)}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: red, background: '#FBEAE7', padding: '2px 8px', borderRadius: 20 }}>LIVE SOS</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{e.desc}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <MapPin size={11} /> {e.loc} · {e.time}
                </div>
              </div>
              <StatusPill status={e.status} />
              {!canRespond ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 190 }}>
                  Security staff can acknowledge and resolve alerts.
                </span>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  {e.status === 'Active' && (
                    <button
                      disabled={busy}
                      onClick={() => changeStatus(e, 'Acknowledged', 'Acknowledged from the dashboard console')}
                      style={{
                        background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8,
                        padding: '8px 14px', fontSize: 12, fontWeight: 700,
                        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}
                    >Acknowledge</button>
                  )}
                  {(e.status === 'Active' || e.status === 'Acknowledged') && (
                    <button
                      disabled={busy}
                      onClick={() => changeStatus(e, 'Responding', 'Responder dispatched')}
                      style={{
                        background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '8px 14px', fontSize: 12, fontWeight: 700,
                        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}
                    >Dispatch</button>
                  )}
                  {e.status !== 'Resolved' && (
                    <button
                      disabled={busy}
                      onClick={() => changeStatus(e, 'Resolved', 'Resolved from the dashboard console')}
                      style={{
                        background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '8px 14px', fontSize: 12, fontWeight: 700,
                        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}
                    >Resolve</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
