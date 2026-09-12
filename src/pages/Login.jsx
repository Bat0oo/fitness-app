import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setErr(error.message)
      else setMsg('Account created. You can sign in now.')
      // If "Confirm email" is ON in Supabase, tell them to check inbox instead:
      // else setMsg('Check your email to confirm your account.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErr(error.message)
      // on success, the auth listener in useAuth flips to the app automatically
    }
    setLoading(false)
  }

  async function signInWithGoogle() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setErr(error.message)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Workout Planner</h1>
        <p className="auth-sub">
          {mode === 'signin' ? 'Sign in to your account.' : 'Create an account to save your plan.'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'signin' ? "No account? " : 'Already have one? '}
          <button
            type="button"
            className="link-btn"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(''); setMsg('') }}
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>

        <div className="auth-divider">or</div>
        <button onClick={signInWithGoogle} className="btn-google">Continue with Google</button>

        {msg && <p className="auth-note">{msg}</p>}
        {err && <p className="auth-err">{err}</p>}
      </div>
    </div>
  )
}