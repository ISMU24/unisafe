import { useEffect, useMemo, useState } from 'react'
import { subscribeAlerts, markAlertRead } from '../api.js'

/**
 * Alert notifications for the signed-in responder.
 *
 * Previously this rendered a hardcoded list that never changed, which meant the
 * bell could not surface anything the mobile app actually sent. It now reads
 * /api/alerts/my - available to every role, unlike /api/alerts which is
 * ADMIN/ICT-only - and refreshes on the `alert-update` push.
 */
const SEVERITY_ORDER = { Critical: 0, Warning: 1, Info: 2 }

function relativeTime(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)} d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true);
    const stop = subscribeAlerts(
      (next) => { setAlerts(next); setError(null); setLoading(false); },
      (err) => { setError(err); setLoading(false); }
    );
    return stop;
  }, [])

  // Newest first, with critical alerts floated to the top.
  const ordered = useMemo(
    () => [...alerts].sort((a, b) => {
      const bySeverity = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
      if (bySeverity !== 0) return bySeverity;
      return new Date(b.sent_at || b.created_at || 0) - new Date(a.sent_at || a.created_at || 0);
    }),
    [alerts]
  )

  const unread = alerts.filter((a) => !a.is_read).length

  const markAll = async () => {
    const pending = alerts.filter((a) => !a.is_read)
    if (pending.length === 0) return
    // Optimistic so the dot clears immediately; a failure refetches on the
    // next tick rather than lying about the stored state.
    setAlerts((current) => current.map((a) => ({ ...a, is_read: true })))
    try {
      await Promise.all(pending.map((a) => markAlertRead(a.id)))
    } catch {
      setError(new Error('Some alerts could not be marked as read.'))
    }
  }

  return (
    <div className="notif-wrap">
      <button className="notif-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        🔔
        {unread > 0 && <span className="notif-dot" />}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-header flex justify-between items-center">
            <span>Notifications {unread > 0 && `(${unread})`}</span>
            {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAll}>Mark all read</button>}
          </div>

          {error && <div className="notif-item"><div className="notif-item-time">{error.message}</div></div>}
          {loading && <div className="notif-item"><div className="notif-item-time">Loading…</div></div>}
          {!loading && !error && ordered.length === 0 && (
            <div className="notif-item"><div className="notif-item-time">No alerts</div></div>
          )}

          {ordered.map((alert) => (
            <div key={alert.id} className={`notif-item${alert.is_read ? '' : ' unread'}`}>
              <div className="notif-item-title">
                {alert.severity && alert.severity !== 'Info' ? `[${alert.severity}] ` : ''}
                {alert.title}
              </div>
              <div className="notif-item-time">
                {relativeTime(alert.sent_at || alert.created_at)}
                {alert.sent_by_name ? ` · ${alert.sent_by_name}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
