import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function signInWithEmail(e) {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setErr(error.message)
    else setSent(true)
  }

  async function signInWithGoogle() {
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
        <p className="auth-sub">Sign in to build and save your plan.</p>

        {sent ? (
          <p className="auth-note">Check your email for a login link.</p>
        ) : (
          <form onSubmit={signInWithEmail} className="auth-form">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button type="submit" className="btn-primary">Send login link</button>
          </form>
        )}

        <div className="auth-divider">or</div>
        <button onClick={signInWithGoogle} className="btn-google">Continue with Google</button>

        {err && <p className="auth-err">{err}</p>}
      </div>
    </div>
  )
}
