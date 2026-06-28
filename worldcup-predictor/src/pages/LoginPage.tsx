import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const t = useT()

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
        <p className="login-tag">{t('La polla del Mundial 2026 🏆', 'La polla del Mundial 2026 🏆')}</p>
        <p className="muted">
          {t(
            "Private knockout-stage prediction pool. Sign in with your email — we'll send you a one-tap magic link.",
            'Polla privada de la fase de eliminación. Inicia sesión con tu correo electrónico y te enviaremos un enlace de acceso de un toque.',
          )}
        </p>

        {sent ? (
          <div className="notice notice-ok">
            <strong>{t('Check your email.', 'Revisa tu correo.')}</strong>
            <p>{t(`We sent a sign-in link to ${email}. Open it on this device.`, `Enviamos un enlace de acceso a ${email}. Ábrelo en este dispositivo.`)}</p>
            <button className="btn btn-ghost" onClick={() => setSent(false)}>
              {t('Use a different email', 'Usar otro correo electrónico')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">{t('Email', 'Correo electrónico')}</label>
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
              {busy ? t('Sending…', 'Enviando…') : t('Send magic link', 'Enviar enlace de acceso')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
