import { useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import { SectionHeader } from '../components/UniForceUI.jsx'
import { API_BASE, searchPolicies } from '../api.js'

export default function AITools() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const value = question.trim()
    if (!value || loading) return

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await searchPolicies(value))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <SectionHeader
        title="AI Tools"
        sub="Answers grounded in university policy documents"
      />

      <section style={card}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>
          <Sparkles size={16} /> Policy Q&amp;A
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
          Ask a question about university policies. Answers and citations come from the policy service; if it is unavailable, the dashboard will show an error rather than a sample answer.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="policy-question" style={label}>Your question</label>
          <textarea
            id="policy-question"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Ask about a university policy"
            rows={4}
            style={inputStyle}
          />
          <button type="submit" disabled={loading || !question.trim()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 12.5, fontWeight: 700,
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !question.trim() ? 0.6 : 1,
          }}>
            <FileText size={13} /> {loading ? 'Searching policies…' : 'Ask policy assistant'}
          </button>
        </form>

        {error && (
          <p role="alert" style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 14 }}>{error}</p>
        )}

        {result && (
          <div aria-live="polite" style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h4 style={{ color: 'var(--text)', fontSize: 12, marginBottom: 8 }}>Answer</h4>
            <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result.answer}</p>
            {result.sources?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ color: 'var(--text)', fontSize: 12, marginBottom: 8 }}>Sources</h4>
                <ul style={{ display: 'grid', gap: 7, paddingLeft: 18, color: 'var(--text-muted)', fontSize: 12 }}>
                  {result.sources.map((source, index) => {
                    const href = source.folder && source.filename
                      ? `${API_BASE}/api/policies/${encodeURIComponent(source.folder)}/${encodeURIComponent(source.filename)}`
                      : null
                    return (
                      <li key={`${source.filename || source.title}-${source.page}-${index}`}>
                        {href
                          ? <a href={`${href}#page=${source.page}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{source.title || source.filename}</a>
                          : <span>{source.title || source.filename}</span>}
                        {source.page != null ? `, page ${source.page}` : ''}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <p style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 14 }}>
        Other AI panels were removed because they displayed fabricated incidents, staffing recommendations, hotspot patterns, or anomaly flags.
      </p>
    </div>
  )
}

const card = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
}
const label = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
}
const inputStyle = {
  width: '100%',
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  resize: 'vertical',
}
