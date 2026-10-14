import { useEffect, useState } from 'react'
import { MapPin, Clock, LifeBuoy } from 'lucide-react'
import { ErrorBanner, LoadingBlock, SectionHeader, StatusPill } from '../components/UniForceUI.jsx'
import { subscribeAssistance, updateAssistance } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { hasAnyRole, RESPONDER_ROLES } from '../utils/roles.js'

const ACTIVE_STATUSES = ['Pending', 'Assigned', 'In Progress']

export default function Assistance() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const { user } = useAuth()
  const canManage = hasAnyRole(user?.roles, RESPONDER_ROLES)

  useEffect(() => {
    const stop = subscribeAssistance(
      rows => { setRequests(rows); setLoading(false); setError(null) },
      {},
      err => { setError(err ? err.message : null); setLoading(false) }
    )
    return stop
  }, [])

  async function changeStatus(request, status) {
    setBusyId(request.id)
    setActionError(null)
    try {
      const updated = await updateAssistance(request.id, { status })
      setRequests(current => current.map(item => item.id === updated.id ? updated : item))
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const visibleRequests = requests.filter(request => ACTIVE_STATUSES.includes(request.status))

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader title="Assistance requests" sub="Live requests for non-emergency campus support" />
      {error && <ErrorBanner message={error} onRetry={() => window.location.reload()} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && <LoadingBlock label="Loading assistance requests…" />}
      {!loading && !error && visibleRequests.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>No open assistance requests.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleRequests.map(request => {
          const busy = busyId === request.id
          const nextStatuses = request.status === 'Pending'
            ? ['Assigned', 'In Progress', 'Cancelled']
            : request.status === 'Assigned'
              ? ['In Progress', 'Completed', 'Cancelled']
              : ['Completed', 'Cancelled']
          return (
            <article key={request.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LifeBuoy size={19} color="var(--text)" />
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-muted)' }}>{String(request.id).slice(0, 8)}</span>
                  <strong style={{ color: 'var(--text)', fontSize: 13 }}>{request.title}</strong>
                  <StatusPill status={request.status} />
                </div>
                <div style={{ color: 'var(--text)', fontSize: 12, marginTop: 7, whiteSpace: 'pre-wrap' }}>
                  {request.description || 'No additional notes provided.'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                  <span>From: {request.requester_name || 'Unknown requester'}{request.requester_id_str ? ` (${request.requester_id_str})` : ''}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {request.location_text || 'Location not supplied'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> {request.created_at ? new Date(request.created_at).toLocaleString('en-PG') : 'Time unknown'}
                  </span>
                </div>
                {request.assignee_name && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>Assigned to: {request.assignee_name}</div>
                )}
              </div>
              {canManage && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {nextStatuses.map(status => (
                    <button
                      key={status}
                      disabled={busy}
                      onClick={() => changeStatus(request, status)}
                      style={{
                        background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '7px 10px', fontSize: 11, fontWeight: 700,
                        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}
                    >{busy ? 'Saving…' : status}</button>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
