import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Mail, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { ink, line, textSub, teal, red } from '../services/mockData.js'

const paper = '#F4F5F2'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [state, setState]       = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()

  async function doLogin(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Email and password are required.')
      return
    }
    setState('checking')
    setErrorMsg('')
    try {
      await login(email.trim(), password)
      setState('success')
      setTimeout(() => navigate('/'), 400)
    } catch (err) {
      setState('error')
      setErrorMsg(err.message || 'Invalid credentials.')
    }
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', minHeight: '100vh', display: 'flex', background: paper }}>
      {/* Left panel */}
      <div style={{ flex: 1, background: ink, color: '#fff', padding: '60px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 46, height: 46, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={26} color={ink} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>UNI-FORCE PORTAL</div>
            <div style={{ fontSize: 12, color: '#9FB2C6' }}>PNG University of Technology · Campus Security</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#9FB2C6', maxWidth: 340, lineHeight: 1.6 }}>
          Monitor incidents, coordinate responders and manage campus security operations from a single, centralised dashboard.
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 400, background: '#fff', padding: '60px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: ink, marginBottom: 4 }}>Staff / officer login</div>
        <div style={{ fontSize: 12, color: textSub, marginBottom: 26 }}>Authorised personnel only</div>

        {errorMsg && (
          <div style={{ background: '#FBEAE7', border: `1px solid ${red}`, color: red, borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}
        <form onSubmit={doLogin}>
          <label style={{ fontSize: 11, color: textSub, marginBottom: 4, display: 'block' }}>Staff ID or email</label>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${line}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            <Mail size={16} color={textSub} />
            <input
              type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="officer.kaupa@pnguot.ac.pg"
              style={{ border: 'none', outline: 'none', marginLeft: 8, fontSize: 13, width: '100%' }}
            />
          </div>

          <label style={{ fontSize: 11, color: textSub, marginBottom: 4, display: 'block' }}>Password</label>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${line}`, borderRadius: 10, padding: '10px 12px', marginBottom: 24 }}>
            <Lock size={16} color={textSub} />
            <input
              type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ border: 'none', outline: 'none', marginLeft: 8, fontSize: 13, width: '100%' }}
            />
          </div>

          <button
            type="submit"
            disabled={state === 'checking'}
            style={{
              background: state === 'success' ? teal : state === 'error' ? red : ink,
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '13px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {state === 'checking' && <Loader2 size={16} />}
            {state === 'success'  && <CheckCircle2 size={16} />}
            {state === 'error'    && <AlertCircle size={16} />}
            {state === 'idle'     ? 'Log in'
              : state === 'checking' ? 'Verifying…'
              : state === 'success'  ? 'Login successful'
              : 'Try again'}
          </button>
        </form>
      </div>
    </div>
  )
}
