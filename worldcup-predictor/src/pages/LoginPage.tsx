import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Return to the app after clicking the magic link.
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="center-screen">
      <div className="login-card">
        <div className="login-badge">⚽</div>
        <h1 className="login-title">
          Polla <span className="brand-accent">LDF</span>
        </h1>
        <p className="login-tag">La polla del Mundial 2026 🏆</p>
        <p className="muted">
          Private knockout-stage prediction pool. Sign in with your email — we'll send
          you a one-tap magic link.
        </p>

        {sent ? (
          <div className="notice notice-ok">
            <strong>Check your email.</strong>
            <p>We sent a sign-in link to {email}. Open it on this device.</p>
            <button className="btn btn-ghost" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <div className="notice notice-err">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
