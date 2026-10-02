import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight, MapPin, Clock, Check } from 'lucide-react'
import { SectionHeader, StatusPill, CatBadge, TableHeader, DetailRow, LoadingBlock, ErrorBanner } from '../components/UniForceUI.jsx'
import { subscribeIncidents, subscribePersonnel, getIncidents, updateIncidentStatus, assignIncident } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { RESPONDER_ROLES, hasAnyRole } from '../utils/roles.js'
import { STAGES, teal } from '../services/mockData.js'

export default function Incidents() {
  const location = useLocation()
  const { user } = useAuth()
  const [incidents,  setIncidents]  = useState([])
  const [personnel,  setPersonnel]  = useState([])
  const [selectedId, setSelectedId] = useState(location.state?.selectedId ?? null)
  const [filter,     setFilter]     = useState('All')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [actionError,setActionError]= useState(null)
  const [busy,       setBusy]       = useState(false)

  const canManage = hasAnyRole(user?.roles, RESPONDER_ROLES)

  // Live updates arrive over Socket.IO; polling is only the fallback.
  useEffect(() => {
    const stopIncidents = subscribeIncidents(
      (rows) => { setIncidents(rows); setLoading(false); setError(null) },
      {},
      (err) => { setError(err ? err.message : null); setLoading(false) }
    )
    const stopPersonnel = subscribePersonnel(
      (rows) => setPersonnel(rows),
      (err) => { if (err) setError(err.message) }
    )
    return () => { stopIncidents(); stopPersonnel() }
  }, [])

  // Drop a stale selection when the incident disappears (e.g. deleted).
  useEffect(() => {
    if (selectedId && incidents.length && !incidents.some(i => i.docId === selectedId)) {
      setSelectedId(null)
    }
  }, [incidents, selectedId])

  const reload = useCallback(async () => {
    setLoading(true)
    try { setIncidents(await getIncidents()); setError(null) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  async function runAction(fn) {
    setBusy(true); setActionError(null)
    try { await fn() }
    catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  const handleStatusChange = (docId, status) =>
    runAction(async () => { await updateIncidentStatus(docId, status); await reload() })

  const handleAssign = (docId, assigneeId) =>
    runAction(async () => { await assignIncident(docId, assigneeId); await reload() })

  const selected = incidents.find(i => i.docId === selectedId)

  if (selected) {
    return (
      <IncidentDetail
        inc={selected}
        personnel={personnel}
        canManage={canManage}
        busy={busy}
        actionError={actionError}
        onBack={() => setSelectedId(null)}
        onStatus={handleStatusChange}
        onAssign={handleAssign}
      />
    )
  }

  const visible = incidents.filter(i => filter === 'All' || i.type === filter)

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader title="View incidents" sub="All reported incidents and SOS alerts" />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['All', 'Security', 'Fire', 'Ambulance', 'Other'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 20,
            border: `1px solid ${filter === f ? 'var(--text)' : 'var(--border)'}`,
            background: filter === f ? 'var(--text)' : 'var(--bg2)',
            color: filter === f ? 'var(--bg)' : 'var(--text-muted)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>{f}</button>
        ))}
      </div>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <TableHeader cols={['ID', 'Type', 'Description', 'Reporter', 'Time', 'Status', '']} />
        {loading && <LoadingBlock label="Loading incidents…" />}
        {!loading && !visible.length && (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>
            No incidents to show{error ? '' : ' yet'}.
          </div>
        )}
        {visible.map(i => (
          <button key={i.docId} onClick={() => setSelectedId(i.docId)} style={{
            display: 'grid', gridTemplateColumns: '90px 110px 1fr 160px 70px 140px 24px', alignItems: 'center',
            width: '100%', padding: '11px 14px', background: 'none', border: 'none',
            borderTop: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-muted)' }}>{i.id}</span>
            <CatBadge type={i.type} />
            <span style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>{i.desc}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{i.reporter}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{i.time}</span>
            <StatusPill status={i.status} />
            <ChevronRight size={15} color="var(--text-muted)" />
          </button>
        ))}
      </div>
    </div>
  )
}

function IncidentDetail({ inc, personnel, canManage, busy, actionError, onBack, onStatus, onAssign }) {
  const idx = STAGES.indexOf(inc.status)
  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
        <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to incidents
      </button>
      {actionError && <ErrorBanner message={actionError} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{inc.id}</span>
            <CatBadge type={inc.type} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{inc.desc}</div>
        </div>
        <StatusPill status={inc.status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Timeline */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Case timeline</div>
          {STAGES.map((s, i) => (
            <div key={s} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: i <= idx ? teal : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i <= idx && <Check size={11} color="#fff" />}
                </div>
                {i < STAGES.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 22, background: i < idx ? teal : 'var(--border)' }} />}
              </div>
              <div style={{ paddingBottom: 18, fontSize: 12.5, fontWeight: 700, color: i <= idx ? 'var(--text)' : 'var(--text-muted)' }}>{s}</div>
            </div>
          ))}
          {canManage ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {STAGES.map(s => (
                <button key={s} disabled={busy || inc.status === s} onClick={() => onStatus(inc.docId, s)} style={{
                  fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
                  opacity: inc.status === s ? 0.6 : 1,
                  border: `1px solid ${inc.status === s ? 'var(--text)' : 'var(--border)'}`,
                  background: inc.status === s ? 'var(--text)' : 'var(--bg2)',
                  color: inc.status === s ? 'var(--bg)' : 'var(--text)',
                }}>{s}</button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Only security staff can change this status.
            </div>
          )}
        </div>

        {/* Details + assign */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Details</div>
            <DetailRow label="Reporter" value={inc.reporter} />
            <DetailRow label="Location" value={inc.loc} icon={MapPin} />
            <DetailRow label="Reported" value={inc.time} icon={Clock} />
            <DetailRow label="Priority" value={inc.priority || 'Medium'} />
            <DetailRow label="Anonymous" value={inc.anonymous ? 'Yes' : 'No'} last />
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Assign responder</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Currently: <strong style={{ color: 'var(--text)' }}>{inc.assignee}</strong>
            </div>
            {!canManage ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Only security staff can assign responders.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personnel.filter(p => p.status !== 'Off duty').map(p => (
                  <button key={p.docId} disabled={busy} onClick={() => onAssign(inc.docId, p.docId)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px',
                    borderRadius: 8, border: '1px solid var(--border)',
                    background: inc.assignee === p.name ? '#E4F2EC' : 'var(--bg2)',
                    cursor: busy ? 'wait' : 'pointer',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{p.name}</span>
                    {inc.assignee === p.name
                      ? <Check size={14} color={teal} />
                      : <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{p.cases} cases</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
