import { useState } from 'react'
import { Sparkles, FileText, UserCheck, MapPin, Search, AlertTriangle } from 'lucide-react'
import { SectionHeader } from '../components/UniForceUI.jsx'
import { seedIncidents, PERSONNEL } from '../services/mockData.js'

const INCIDENTS = seedIncidents()

// ── helpers ──────────────────────────────────────────────────────────────────

function aiSummarize(raw) {
  if (!raw.trim()) return ''
  const lines = raw.split('\n').filter(Boolean)
  const type = /fire|smoke|flame/i.test(raw) ? 'fire' : /ambulance|collapse|faint|medical/i.test(raw) ? 'medical' : 'security'
  const loc = raw.match(/(?:at|near|in)\s([A-Z][^,.]+)/)?.[1] ?? 'the reported location'
  return `Incident Summary\n\nA ${type} incident was reported at ${loc}. ${lines.length} update(s) were logged by responding officers. Key details: ${lines.slice(0, 2).join('; ')}. The situation was monitored and appropriate response measures were initiated. All relevant evidence and officer notes have been compiled for the final report.`
}

function recommendDispatch(inc) {
  const available = PERSONNEL.filter(p => p.status !== 'Off duty')
  const fireNeeded = inc.type === 'Fire'
  const scored = available.map(p => {
    let score = 10 - p.cases * 2
    if (fireNeeded && p.role === 'Field Responder') score += 3
    if (p.status === 'On duty') score += 2
    return { ...p, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored
}

const HOTSPOTS = [
  { location: 'Hostel 3, North Campus', risk: 'High', pattern: '3× more incidents after 9 pm on paydays', type: 'Security', count: 11 },
  { location: 'Science Building, Lab B', risk: 'High', pattern: 'Fire/smoke reports spike during lab hours (2–5 pm)', type: 'Fire', count: 7 },
  { location: 'Sports Complex', risk: 'Medium', pattern: 'Medical incidents peak on Mondays 6–8 am', type: 'Ambulance', count: 5 },
  { location: 'Staff Car Park', risk: 'Medium', pattern: 'Unauthorised access reports every Friday evening', type: 'Security', count: 4 },
  { location: 'Block C Walkway', risk: 'Low', pattern: 'Infrastructure faults reported after heavy rain', type: 'Other', count: 2 },
]

const RISK_COLOR = { High: '#C13B2E', Medium: '#C97F1E', Low: '#1F7A5C' }
const RISK_BG    = { High: '#FBEAE7', Medium: '#FBF0DF', Low: '#E4F2EC' }

function nlSearch(query) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return INCIDENTS.filter(i => {
    const blob = `${i.type} ${i.desc} ${i.loc} ${i.status} ${i.time}`.toLowerCase()
    const unresolved = q.includes('unresolved') ? i.status !== 'Resolved' : true
    const typeMatch = ['fire','security','ambulance','other'].find(t => q.includes(t))
      ? i.type.toLowerCase() === ['fire','security','ambulance','other'].find(t => q.includes(t))
      : true
    const locWords = q.match(/\b(hostel|science|gym|sports|block|lab|parking|car park)\b/g) ?? []
    const locMatch = locWords.length ? locWords.some(w => blob.includes(w)) : true
    const monthMatch = q.includes('this month') ? true : true // all data is current
    return unresolved && typeMatch && locMatch && monthMatch
  })
}

const SPAM_FLAGS = [
  { id: 'INC-4499', desc: 'Alien spacecraft landed on roof', reporter: 'Anonymous', reason: 'Implausible content', severity: 'Spam' },
  { id: 'INC-4487', desc: 'Fire everywhere on campus', reporter: 'Anonymous', reason: 'Vague / exaggerated language, no location', severity: 'Suspicious' },
  { id: 'INC-4481', desc: 'Someone looked at me funny', reporter: 'Anonymous', reason: 'Non-actionable report', severity: 'Low quality' },
]

// ── sub-pages ─────────────────────────────────────────────────────────────────

function CaseSummary() {
  const [raw, setRaw] = useState('')
  const [summary, setSummary] = useState('')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <div style={label}>Raw notes / thread</div>
        <textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder={'Paste officer notes, updates, photo captions…\n\nE.g.\n08:12 – Smoke spotted near Lab B\n08:15 – Officer P. Are dispatched\n08:22 – Fire extinguished, no injuries'}
          style={{ ...inputStyle, height: 220, resize: 'vertical' }}
        />
        <button onClick={() => setSummary(aiSummarize(raw))} style={btnStyle}>
          <Sparkles size={13} /> Generate summary
        </button>
      </div>
      <div>
        <div style={label}>Generated narrative</div>
        <div style={{ ...card, minHeight: 220, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: summary ? 'var(--text)' : 'var(--text-muted)' }}>
          {summary || 'Summary will appear here…'}
        </div>
        {summary && (
          <button onClick={() => navigator.clipboard?.writeText(summary)} style={{ ...btnStyle, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            Copy to clipboard
          </button>
        )}
      </div>
    </div>
  )
}

function DispatchRec() {
  const [sel, setSel] = useState(INCIDENTS[0].id)
  const inc = INCIDENTS.find(i => i.id === sel)
  const ranked = recommendDispatch(inc)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <div style={label}>Select incident</div>
        <select value={sel} onChange={e => setSel(e.target.value)} style={inputStyle}>
          {INCIDENTS.map(i => <option key={i.id} value={i.id}>{i.id} — {i.desc}</option>)}
        </select>
        <div style={{ ...card, marginTop: 12 }}>
          <Row k="Type" v={inc.type} />
          <Row k="Location" v={inc.loc} />
          <Row k="Status" v={inc.status} last />
        </div>
      </div>
      <div>
        <div style={label}>Recommended responders</div>
        {ranked.map((p, i) => (
          <div key={p.name} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: i === 0 ? '3px solid var(--accent)' : '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{i === 0 && '⭐ '}{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.role} · {p.status} · {p.cases} active case{p.cases !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Score {p.score}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Hotspots() {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
        Patterns detected from historical incident data — use to guide patrol scheduling.
      </div>
      {HOTSPOTS.map(h => (
        <div key={h.location} style={{ ...card, marginBottom: 10, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: RISK_COLOR[h.risk], marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{h.location}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: RISK_COLOR[h.risk], background: RISK_BG[h.risk], padding: '2px 8px', borderRadius: 20 }}>{h.risk} risk</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>📊 {h.pattern}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{h.type} · {h.count} incidents recorded</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function NLSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  return (
    <div>
      <div style={label}>Ask in plain English</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setResults(nlSearch(q))}
          placeholder='e.g. "show me unresolved fire incidents near the science building this month"'
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={() => setResults(nlSearch(q))} style={btnStyle}><Search size={13} /> Search</button>
      </div>
      {results !== null && (
        results.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No incidents matched your query.</div>
          : results.map(i => (
            <div key={i.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>{i.id}</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{i.desc}</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{i.loc} · {i.time}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 20 }}>{i.status}</span>
            </div>
          ))
      )}
    </div>
  )
}

function AnomalyFlags() {
  const [dismissed, setDismissed] = useState([])
  const visible = SPAM_FLAGS.filter(f => !dismissed.includes(f.id))
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
        Reports automatically flagged as potentially fake, vague, or malicious before they reach responders.
      </div>
      {visible.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No flagged reports right now.</div>}
      {visible.map(f => (
        <div key={f.id} style={{ ...card, marginBottom: 10, borderLeft: '3px solid var(--danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{f.id}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#C13B2E', background: '#FBEAE7', padding: '2px 8px', borderRadius: 20 }}>{f.severity}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>{f.desc}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Reporter: {f.reporter} · Reason: {f.reason}</div>
          </div>
          <button onClick={() => setDismissed(d => [...d, f.id])} style={{ fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 12 }}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}

// ── shared styles ─────────────────────────────────────────────────────────────

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }
const label = { fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }
const inputStyle = { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
const btnStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }

function Row({ k, v, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{v}</span>
    </div>
  )
}

// ── tabs config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'summary',  label: 'Case Summary',    icon: FileText,      component: CaseSummary },
  { id: 'dispatch', label: 'Dispatch Rec.',   icon: UserCheck,     component: DispatchRec },
  { id: 'hotspot',  label: 'Hotspot Predict', icon: MapPin,        component: Hotspots },
  { id: 'search',   label: 'NL Search',       icon: Search,        component: NLSearch },
  { id: 'anomaly',  label: 'Anomaly Flags',   icon: AlertTriangle, component: AnomalyFlags },
]

// ── page ──────────────────────────────────────────────────────────────────────

export default function AITools() {
  const [active, setActive] = useState('summary')
  const ActiveComponent = TABS.find(t => t.id === active).component

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader
        title="AI Tools"
        sub="Intelligent assistance for case management, dispatch, and patrol planning"
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            border: `1px solid ${active === id ? 'var(--accent)' : 'var(--border)'}`,
            background: active === id ? 'rgba(59,130,246,0.12)' : 'var(--bg2)',
            color: active === id ? 'var(--accent)' : 'var(--text-muted)',
          }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <ActiveComponent />
      </div>
    </div>
  )
}
