import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

const RESEND_COOLDOWN = 30

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Seconds until the "Resend" button re-enables, so we don't spam the mailer.
  const [cooldown, setCooldown] = useState(0)
  const [resentNote, setResentNote] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  async function sendLink(isResend: boolean) {
    setError(null)
    setBusy(true)
    setResentNote(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Return to the app after clicking the magic link.
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
    setCooldown(RESEND_COOLDOWN)
    if (isResend) setResentNote(t('New link sent ✓', 'Nuevo enlace enviado ✓'))
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
            <p>{t(`We sent a sign-in link to ${email}.`, `Enviamos un enlace de acceso a ${email}.`)}</p>
            <p className="login-help">
              {t(
                'Open it on this phone · check your spam folder · the link expires in about an hour.',
                'Ábrelo en este teléfono · revisa la carpeta de spam · el enlace vence en aproximadamente una hora.',
              )}
            </p>
            {resentNote && <p className="login-resent">{resentNote}</p>}
            {error && <div className="notice notice-err">{error}</div>}
            <div className="login-actions">
              <button
                className="btn btn-primary"
                onClick={() => sendLink(true)}
                disabled={busy || cooldown > 0}
              >
                {busy
                  ? t('Sending…', 'Enviando…')
                  : cooldown > 0
                    ? t(`Resend in ${cooldown}s`, `Reenviar en ${cooldown}s`)
                    : t('Resend link', 'Reenviar enlace')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setSent(false)
                  setCooldown(0)
                  setError(null)
                  setResentNote(null)
                }}
              >
                {t('Use a different email', 'Usar otro correo electrónico')}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              sendLink(false)
            }}
            className="login-form"
          >
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
        <p className="login-legal">
          {t('By signing in you agree to our ', 'Al iniciar sesión aceptas nuestros ')}
          <Link to="/terms">{t('Terms', 'Términos')}</Link>
          {t(' and ', ' y ')}
          <Link to="/privacy">{t('Privacy Policy', 'Política de Privacidad')}</Link>.
        </p>
      </div>
    </div>
  )
}
