import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { ErrorBanner, LoadingBlock, SectionHeader } from '../components/UniForceUI.jsx'
import { getRecycleBin, getRecycleRecords, permanentlyDeleteRecord, recycleRecord, restoreRecord } from '../api.js'

const TYPE_LABELS = {
  incident: 'Incident',
  sos: 'SOS alert',
  alert: 'Announcement',
  assistance: 'Assistance request',
  appeal: 'Appeal',
  user: 'User account',
}

export default function RecycleBin() {
  const [items, setItems] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deleted, active] = await Promise.all([getRecycleBin(), getRecycleRecords()])
      setItems(deleted)
      setRecords(active)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function moveToBin(record) {
    const key = `${record.type}:${record.id}`
    setBusyKey(key)
    setError(null)
    try {
      await recycleRecord(record.type, record.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyKey(null)
    }
  }

  async function restore(item) {
    const key = `${item.type}:${item.id}`
    setBusyKey(key)
    setError(null)
    try {
      await restoreRecord(item.type, item.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyKey(null)
    }
  }

  async function permanentlyDelete(item) {
    const consequence = item.type === 'user'
      ? '\n\nThis also permanently removes reports and related activity owned by this account.'
      : ''
    if (!window.confirm(`Permanently delete "${item.label}"? This cannot be undone.${consequence}`)) return

    const key = `${item.type}:${item.id}`
    setBusyKey(key)
    setError(null)
    try {
      await permanentlyDeleteRecord(item.type, item.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader
        title="Recycle Bin"
        sub="Restore deleted records or permanently erase them"
      />
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 16 }}>
        Delete any listed record to move it here. Items stay in the database until permanently deleted;
        restoring returns them to the dashboard.
      </p>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <LoadingBlock label="Loading dashboard records…" /> : (
        <>
          <h3 style={{ color: 'var(--text)', fontSize: 15, margin: '20px 0 10px' }}>Dashboard records</h3>
          {records.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>No active records available to delete.</div>
          ) : (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '130px minmax(180px, 1fr) 180px 150px',
                gap: 12, padding: '10px 14px', background: 'var(--bg3)',
                color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
              }}>
                <span>Record type</span><span>Record</span><span>Created</span><span>Actions</span>
              </div>
              {records.map(record => {
                const key = `${record.type}:${record.id}`
                const busy = busyKey === key
                return (
                  <div key={key} style={{
                    display: 'grid', gridTemplateColumns: '130px minmax(180px, 1fr) 180px 150px',
                    gap: 12, alignItems: 'center', padding: '12px 14px',
                    borderTop: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TYPE_LABELS[record.type] || record.type}</span>
                    <span style={{ minWidth: 0, color: 'var(--text)', fontSize: 12.5, overflowWrap: 'anywhere' }}>{record.label || 'Untitled'}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                      {record.created_at ? new Date(record.created_at).toLocaleString() : 'Unknown'}
                    </span>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => moveToBin(record)} title="Move record to Recycle Bin">
                      <Trash2 size={13} /> {busy ? 'Working…' : 'Delete'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <h3 style={{ color: 'var(--text)', fontSize: 15, margin: '20px 0 10px' }}>Recycle Bin</h3>
          {items.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>The Recycle Bin is empty.</div>
          ) : (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '130px minmax(180px, 1fr) 180px 190px',
            gap: 12, padding: '10px 14px', background: 'var(--bg3)',
            color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
          }}>
            <span>Record type</span><span>Record</span><span>Deleted</span><span>Actions</span>
          </div>
          {items.map(item => {
            const key = `${item.type}:${item.id}`
            const busy = busyKey === key
            return (
              <div key={key} style={{
                display: 'grid', gridTemplateColumns: '130px minmax(180px, 1fr) 180px 190px',
                gap: 12, alignItems: 'center', padding: '12px 14px',
                borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TYPE_LABELS[item.type] || item.type}</span>
                <span style={{ minWidth: 0, color: 'var(--text)', fontSize: 12.5, overflowWrap: 'anywhere' }}>{item.label || 'Untitled'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                  {item.deleted_at ? new Date(item.deleted_at).toLocaleString() : 'Unknown'}
                </span>
                <span style={{ display: 'flex', gap: 7 }}>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => restore(item)} title="Restore record">
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => permanentlyDelete(item)} title="Permanently delete record">
                    <Trash2 size={13} /> {busy ? 'Working…' : 'Delete forever'}
                  </button>
                </span>
              </div>
            )
          })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
