import { useState, useEffect, useCallback } from 'react';
import { getAuditLogs } from '../api.js';
import { SectionHeader, LoadingBlock, ErrorBanner } from '../components/UniForceUI.jsx';

const COLS = '140px 130px 110px 1fr 1fr 100px';

function pill(success) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      color: success ? '#1F7A5C' : '#C13B2E',
      background: success ? '#E4F2EC' : '#FBE7E7',
    }}>
      {success ? 'OK' : 'FAIL'}
    </span>
  );
}

function Row({ log }) {
  const [open, setOpen] = useState(false);
  const ts = log.created_at ? new Date(log.created_at).toLocaleString('en-PG') : '—';
  return (
    <>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'grid', gridTemplateColumns: COLS,
          padding: '9px 14px', borderBottom: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 12, color: 'var(--text)',
          background: open ? 'var(--bg3)' : undefined,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{ts}</span>
        <span style={{ fontFamily: 'Courier New', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.user_email || log.user_id || '—'}
        </span>
        <span style={{ fontWeight: 700 }}>{log.action}</span>
        <span style={{ color: 'var(--text-muted)' }}>{log.resource_type}{log.resource_id ? ` · ${log.resource_id.slice(0, 8)}…` : ''}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.ip_address || '—'}
        </span>
        {pill(log.success)}
      </div>
      {open && (
        <div style={{
          padding: '10px 14px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg3)', fontSize: 11.5, color: 'var(--text-muted)',
        }}>
          {log.error_message && (
            <div style={{ color: '#C13B2E', marginBottom: 6 }}>Error: {log.error_message}</div>
          )}
          {log.new_values && (
            <div><strong style={{ color: 'var(--text)' }}>new_values: </strong>
              <code style={{ fontFamily: 'Courier New' }}>{JSON.stringify(log.new_values)}</code>
            </div>
          )}
          {log.old_values && (
            <div style={{ marginTop: 4 }}><strong style={{ color: 'var(--text)' }}>old_values: </strong>
              <code style={{ fontFamily: 'Courier New' }}>{JSON.stringify(log.old_values)}</code>
            </div>
          )}
          {log.user_agent && (
            <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
              <strong style={{ color: 'var(--text)' }}>user_agent: </strong>{log.user_agent}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (action) filters.action = action;
      if (resource) filters.resource_type = resource;
      setLogs(await getAuditLogs({ ...filters, limit: 200 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [action, resource]);

  useEffect(() => { load(); }, [load]);

  const inputStyle = {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg2)', color: 'var(--text)', fontSize: 12.5,
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <SectionHeader title="Audit Logs" sub="All security-relevant actions recorded by the server" />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input style={inputStyle} placeholder="Filter by action (e.g. LOGIN)" value={action}
          onChange={e => setAction(e.target.value)} />
        <input style={inputStyle} placeholder="Filter by resource (e.g. user)" value={resource}
          onChange={e => setResource(e.target.value)} />
        <button onClick={load} style={{
          ...inputStyle, cursor: 'pointer', fontWeight: 700,
          background: 'var(--bg3)', border: '1px solid var(--border)',
        }}>Refresh</button>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {loading ? <LoadingBlock label="Loading audit logs…" /> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS,
            padding: '9px 14px', background: 'var(--bg3)',
            borderBottom: '1px solid var(--border)',
          }}>
            {['Timestamp', 'User', 'Action', 'Resource', 'IP Address', 'Result'].map((h, i) => (
              <span key={i} style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</span>
            ))}
          </div>
          {logs.length === 0
            ? <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>No audit logs found.</div>
            : logs.map(log => <Row key={log.id} log={log} />)
          }
        </div>
      )}
    </div>
  );
}
