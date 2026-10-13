import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight, MapPin, Clock, Check, Trash2 } from 'lucide-react'
import { SectionHeader, StatusPill, CatBadge, TableHeader, DetailRow, LoadingBlock, ErrorBanner } from '../components/UniForceUI.jsx'
import { subscribeIncidents, subscribePersonnel, getIncidents, getIncident, getIncidentMedia, updateIncidentStatus, assignIncident, recycleRecord } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { RESPONDER_ROLES, ADMIN_ROLES, hasAnyRole } from '../utils/roles.js'
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
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [detailRetry, setDetailRetry] = useState(0)

  const canManage = hasAnyRole(user?.roles, RESPONDER_ROLES)
  const isAdmin = hasAnyRole(user?.roles, ADMIN_ROLES)

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

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }

    let active = true
    setSelectedDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    getIncident(selectedId)
      .then(incident => { if (active) setSelectedDetail(incident) })
      .catch(err => { if (active) setDetailError(err.message) })
      .finally(() => { if (active) setDetailLoading(false) })

    return () => { active = false }
  }, [selectedId, detailRetry])

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

  const handleRecycle = (docId) => runAction(async () => {
    await recycleRecord('incident', docId)
    setSelectedId(null)
    await reload()
  })

  const selected = incidents.find(i => i.docId === selectedId)

  if (selected) {
    return (
      <IncidentDetail
        inc={selectedDetail?.docId === selectedId ? selectedDetail : selected}
        personnel={personnel}
        canManage={canManage}
        busy={busy}
        actionError={actionError}
        isAdmin={isAdmin}
        detailLoading={detailLoading}
        detailError={detailError}
        onRetryDetail={() => setDetailRetry(retry => retry + 1)}
        onBack={() => setSelectedId(null)}
        onRecycle={handleRecycle}
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
      {actionError && <ErrorBanner message={actionError} />}
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
            <div style={{ minWidth: 0 }}>
              <CatBadge type={i.type} />
              {i.incidentType && (
                <div style={{ color: 'var(--text-muted)', fontSize: 10.5, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.incidentType}
                </div>
              )}
            </div>
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

function IncidentDetail({ inc, personnel, canManage, isAdmin, busy, actionError, detailLoading, detailError, onRetryDetail, onBack, onRecycle, onStatus, onAssign }) {
  const idx = STAGES.indexOf(inc.status)
  const media = Array.isArray(inc.media) ? inc.media : []
  const attachments = media.filter(file => file.id)
  const coordinates = inc.latitude != null && inc.longitude != null &&
    Number.isFinite(Number(inc.latitude)) && Number.isFinite(Number(inc.longitude))
    ? `${Number(inc.latitude).toFixed(6)}, ${Number(inc.longitude).toFixed(6)}`
    : 'GPS coordinates not supplied'
  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
        <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to incidents
      </button>
      {actionError && <ErrorBanner message={actionError} />}
      {detailError && <ErrorBanner message={`Could not load incident attachments: ${detailError}`} onRetry={onRetryDetail} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{inc.id}</span>
            <CatBadge type={inc.type} />
          </div>
          {inc.incidentType && (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginTop: 8 }}>
              Incident type: {inc.incidentType}
            </div>
          )}
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{inc.desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusPill status={inc.status} />
          {isAdmin && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => onRecycle(inc.docId)}
              title="Move incident to Recycle Bin"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
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
            <DetailRow label="Category" value={inc.type || 'Not specified'} />
            <DetailRow label="Incident type" value={inc.incidentType || 'Not specified'} />
            <DetailRow label="Location" value={inc.loc} icon={MapPin} />
            <DetailRow label="GPS coordinates" value={coordinates} icon={MapPin} />
            <DetailRow label="Reported" value={inc.time} icon={Clock} />
            <DetailRow label="Priority" value={inc.priority || 'Medium'} />
            <DetailRow label="Identity visibility" value={inc.anonymous ? 'Confidential to responders' : 'Visible to responders'} last />
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Attachments</div>
            {detailLoading ? (
              <LoadingBlock label="Loading attachments…" />
            ) : attachments.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {attachments.map((file, index) => {
                  const isImage = typeof file.mime_type === 'string' && file.mime_type.startsWith('image/')
                  return (
                    <IncidentAttachment
                      key={file.id}
                      incidentId={inc.docId}
                      file={file}
                      index={index}
                      isImage={isImage}
                    />
                  )
                })}
              </div>
            ) : detailError ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Attachments could not be loaded.</div>
            ) : media.length ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>The saved attachment links are invalid.</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No attachments on this incident.</div>
            )}
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

function IncidentAttachment({ incidentId, file, index, isImage }) {
  const [href, setHref] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setHref('')
    setError('')
    getIncidentMedia(incidentId, file.id)
      .then(blob => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setHref(objectUrl)
      })
      .catch(err => { if (active) setError(err.message) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [incidentId, file.id, retry])

  const filename = `Incident attachment ${index + 1}`
  if (error) {
    return (
      <div style={{ minWidth: 0, color: 'var(--danger, #b42318)', fontSize: 12 }}>
        {filename} could not be loaded: {error}{' '}
        <button onClick={() => setRetry(value => value + 1)} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Retry</button>
      </div>
    )
  }
  if (!href) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading {filename.toLowerCase()}…</div>
  }
  return (
    <div style={{ minWidth: 0 }}>
      {isImage && (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${filename}`}>
          <img
            src={href}
            alt={filename}
            loading="lazy"
            style={{ display: 'block', maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8, marginBottom: 8 }}
          />
        </a>
      )}
      <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 12.5, overflowWrap: 'anywhere' }}>
        {filename}
      </a>
      {file.file_size != null && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{formatFileSize(file.file_size)}</div>
      )}
    </div>
  )
}

function formatFileSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
}
