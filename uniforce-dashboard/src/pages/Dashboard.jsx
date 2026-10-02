import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileWarning, Siren, Clock, Users } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { SectionHeader, StatCard, CatBadge, StatusPill, DutyPill, ErrorBanner } from '../components/UniForceUI.jsx'
import { subscribeIncidents, subscribePersonnel, subscribeSOSEvents } from '../api.js'
import { MAP_MARKERS, blue, red, amber, teal, CAMPUS_CENTRE, buildingForLocation } from '../services/mockData.js'
import { useTheme } from '../context/ThemeContext.jsx'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const TYPE_COLOR = { Security: blue, Ambulance: teal, Fire: red, Other: amber }

// PNGUoT Taraka Campus, East Taraka — 6°40'12"S 146°59'42"E (per Wikipedia / Wikimapia)
const CAMPUS_CENTER  = CAMPUS_CENTRE
const CAMPUS_BOUNDS  = [[-6.682, 146.986], [-6.667, 146.999]]

function MapResetter({ expanded }) {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize()
      map.setView(CAMPUS_CENTER, expanded ? 17 : 16)
    }, 50)
  }, [expanded])
  return null
}

function DashMap({ incidents, mapLayer, setMapLayer, expanded, onToggleExpand, TILES, TYPE_COLOR }) {
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 4 }}>
        {[['satellite', '🛰 Satellite'], ['street', '🗺 Street']].map(([key, lbl]) => (
          <button key={key} onClick={() => setMapLayer(key)} style={{
            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(0,0,0,0.3)',
            background: mapLayer === key ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)',
            color: mapLayer === key ? '#fff' : '#333',
          }}>{lbl}</button>
        ))}
        <button onClick={onToggleExpand} style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid rgba(0,0,0,0.3)', background: 'rgba(0,0,0,0.75)', color: '#fff',
        }}>{expanded ? '✕ Close' : '⛶ Expand'}</button>
      </div>
      <MapContainer
        center={CAMPUS_CENTER} zoom={16} minZoom={15} maxZoom={19}
        maxBounds={CAMPUS_BOUNDS} maxBoundsViscosity={1.0}
        scrollWheelZoom={true}
        style={{ height: expanded ? '88vh' : '100%', width: '100%' }}
      >
        <TileLayer key={mapLayer} attribution={TILES[mapLayer].attr} url={TILES[mapLayer].url} />
        <MapResetter expanded={expanded} />
        {incidents.map(i => {
          const b = buildingForLocation(i.loc)
          return (
            <Circle
              key={i.docId}
              center={b ? b.position : CAMPUS_CENTER}
              radius={30}
              pathOptions={{
                color: TYPE_COLOR[i.type] ?? '#C97F1E',
                fillColor: TYPE_COLOR[i.type] ?? '#C97F1E',
                fillOpacity: i.status === 'Resolved' ? 0.2 : 0.55,
                weight: 2,
              }}
            >
              <Popup>
                <strong>{i.id}</strong> — {i.type}<br />
                {i.desc}<br />
                <span style={{ fontSize: 11, color: '#6B7280' }}>{i.loc}</span>
              </Popup>
            </Circle>
          )
        })}
        {MAP_MARKERS.map((m, idx) => (
          <Marker key={idx} position={m.position}>
            <Popup><strong>{m.title}</strong><br />{m.description}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export default function Dashboard() {
  const [incidents,  setIncidents]  = useState([])
  const [personnel,  setPersonnel]  = useState([])
  const [mapLayer,   setMapLayer]   = useState('satellite')
  const [mapExpanded, setMapExpanded] = useState(false)
  const navigate = useNavigate()
  const { dark } = useTheme()

  const TILES = {
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics' },
    street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // SOS raised from the mobile app lands in its own feed, not in /api/incidents.
  // Without this the "Active SOS" tile and the dispatch log never reflected a
  // real emergency, because nothing here read /api/sos.
  const [sosEvents, setSosEvents] = useState([])

  useEffect(() => {
    const unsubI = subscribeIncidents(
      (rows) => { setIncidents(rows); setLoading(false); setError(null) },
      {},
      (err) => { setError(err ? err.message : null); setLoading(false) }
    )
    const unsubS = subscribeSOSEvents(
      (rows) => { setSosEvents(rows); setLoading(false) },
      {},
      (err) => { if (err) setError(err.message) }
    )
    const unsubP = subscribePersonnel(
      (rows) => setPersonnel(rows),
      (err) => { if (err) setError(err.message) }
    )
    return () => { unsubI(); unsubS(); unsubP() }
  }, [])

  const openIncidents = incidents.filter(i => !['Resolved', 'Closed', 'Cancelled'].includes(i.status))
  // Count active emergencies from the dedicated feed when it is available, so
  // the tile matches the Emergency page. SOS raised as incidents are folded in
  // too, otherwise legacy rows would vanish from the count.
  const activeSosFromFeed = sosEvents.filter(s => !['Resolved', 'Cancelled'].includes(s.status)).length
  const activeSOS = sosEvents.length > 0 ? activeSosFromFeed : incidents.filter(i => i.isSOS && !['Resolved', 'Cancelled'].includes(i.status)).length
  const onDuty        = personnel.filter(p => p.status === 'On duty').length

  // Dispatch log merges both feeds, newest first, so an SOS appears alongside
  // reports instead of in a separate list.
  const dispatchLog = [
    ...incidents.map(i => ({ ...i, _at: i.createdAt || i.submittedAt })),
    ...sosEvents.map(s => ({
      docId: s.docId, id: s.docId, type: 'Ambulance', desc: s.desc, reporter: s.reporter,
      assignee: s.assignee, loc: s.loc, time: s.time, status: s.status, isSOS: true, _at: s.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b._at || 0) - new Date(a._at || 0))
    .slice(0, 5)

  const bg         = dark ? 'var(--bg2)' : '#FFFFFF'
  const border     = dark ? '1px solid var(--border)' : '#E4E4DF'
  const titleColor = dark ? 'var(--text)' : '#0B1F33'
  const subColor   = dark ? 'var(--text-muted)' : '#6B7280'
  const rowBg      = dark ? 'var(--bg3)' : '#F4F5F2'

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader title="Security dashboard" sub="Live overview of campus security operations" />
      {error && <ErrorBanner message={error} onRetry={() => window.location.reload()} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        <StatCard label="Open incidents"    value={loading ? '—' : openIncidents.length}  delta="Needs attention"  up={false} icon={FileWarning} color={blue} />
        <StatCard label="Active SOS"        value={loading ? '—' : activeSOS}             delta="Live now"          up={false} icon={Siren}       color={red} />
        <StatCard label="Reports tracked"   value={loading ? '—' : incidents.length}       delta="All categories"              icon={Clock}       color={amber} />
        <StatCard label="Personnel on duty" value={loading ? '—' : `${onDuty} / ${personnel.length}`} delta="From responder list"      icon={Users}       color={teal} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Dispatch log */}
        <div style={{ background: bg, border, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: titleColor, marginBottom: 10 }}>Dispatch log</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dispatchLog.map(i => (
              <button key={`${i.isSOS ? 'sos' : 'inc'}-${i.docId}`} onClick={() => navigate(i.isSOS ? '/emergency' : '/incidents', { state: { selectedId: i.docId } })} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: rowBg, border,
                borderRadius: 10, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', width: '100%',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: subColor, width: 78 }}>{i.id}</span>
                <CatBadge type={i.type} />
                <span style={{ fontSize: 12, color: titleColor, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.desc}</span>
                <span style={{ fontSize: 10.5, color: subColor, fontFamily: 'monospace' }}>{i.time}</span>
                <StatusPill status={i.status} />
              </button>
            ))}
            {dispatchLog.length === 0 && (
              <div style={{ fontSize: 12, color: subColor, padding: '10px 2px' }}>
                {loading ? 'Loading…' : 'No reports yet. New reports and SOS alerts appear here as they arrive.'}
              </div>
            )}
          </div>
        </div>

        {/* Personnel status */}
        <div style={{ background: bg, border, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: titleColor, marginBottom: 10 }}>Personnel status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {personnel.map(p => (
              <div key={p.docId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: titleColor }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: subColor }}>{p.role}</div>
                </div>
                <DutyPill status={p.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live campus map */}
      {mapExpanded && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '92vw', height: '88vh', borderRadius: 12, overflow: 'hidden' }}>
            <DashMap incidents={incidents} mapLayer={mapLayer} setMapLayer={setMapLayer} expanded={true} onToggleExpand={() => setMapExpanded(false)} TILES={TILES} TYPE_COLOR={TYPE_COLOR} />
          </div>
        </div>
      )}
      <div style={{ background: bg, border, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: titleColor, marginBottom: 10 }}>Live campus map — PNGUoT Taraka</div>
        <div className="uf-map-container" style={{ position: 'relative' }}>
          <DashMap incidents={incidents} mapLayer={mapLayer} setMapLayer={setMapLayer} expanded={false} onToggleExpand={() => setMapExpanded(true)} TILES={TILES} TYPE_COLOR={TYPE_COLOR} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {Object.entries(TYPE_COLOR).map(([type, color]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: subColor }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {type}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
