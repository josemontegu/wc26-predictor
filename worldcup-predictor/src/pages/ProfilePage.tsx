import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'
import EmojiPicker from '../components/EmojiPicker'
import { useT } from '../lib/i18n'

export default function ProfilePage({ forced = false }: { forced?: boolean }) {
  const t = useT()
  const { session, profile, isAdmin, refreshProfile, signOut } = useAuth()
  const [nickname, setNickname] = useState('')
  const [emoji, setEmoji] = useState('')
  const [others, setOthers] = useState<Pick<Profile, 'id' | 'nickname' | 'emoji'>[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname ?? '')
      setEmoji(profile.emoji ?? '')
    }
  }, [profile])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, nickname, emoji')
      .then(({ data }) => setOthers((data as Pick<Profile, 'id' | 'nickname' | 'emoji'>[]) ?? []))
  }, [])

  const myId = session?.user.id
  const identitySet = Boolean(profile?.nickname?.trim() && profile?.emoji)
  // Nickname + emoji are chosen once. After that only an admin can change them.
  const canEdit = !identitySet || isAdmin
  const takenEmojis = new Set(others.filter((p) => p.id !== myId && p.emoji).map((p) => p.emoji))

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!session?.user) return
    const value = nickname.trim()
    if (!value) return setError(t('Please choose a nickname.', 'Por favor elige un apodo.'))
    if (!emoji) return setError(t('Please pick an emoji.', 'Por favor elige un emoji.'))

    const nameTaken = others.some(
      (p) => p.id !== myId && p.nickname.trim().toLowerCase() === value.toLowerCase(),
    )
    if (nameTaken)
      return setError(
        t(
          `"${value}" is already taken — pick another nickname.`,
          `"${value}" ya está en uso — elige otro apodo.`,
        ),
      )
    if (takenEmojis.has(emoji))
      return setError(t('That emoji is taken — pick another.', 'Ese emoji ya está en uso — elige otro.'))

    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ nickname: value, display_name: value, emoji })
      .eq('id', session.user.id)
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? t(
              'That nickname or emoji is already taken — pick another.',
              'Ese apodo o emoji ya está en uso — elige otro.',
            )
          : error.message,
      )
      return
    }
    setSaved(true)
    await refreshProfile()
  }

  return (
    <div className="page">
      <h1>{forced ? t('Set up your player', 'Configura tu jugador') : t('Your profile', 'Tu perfil')}</h1>

      {canEdit ? (
        <>
          {!isAdmin && (
            <div className="notice notice-info">
              ⚠️{' '}
              {t(
                'Choose carefully — your nickname and emoji are set',
                'Elige con cuidado — tu apodo y emoji se definen',
              )}{' '}
              <strong>{t('once', 'una sola vez')}</strong>{' '}
              {t("and can't be changed afterwards.", 'y no se pueden cambiar después.')}
            </div>
          )}
          <form onSubmit={handleSave} className="form-card">
            <label htmlFor="nick">{t('Nickname', 'Apodo')}</label>
            <input
              id="nick"
              type="text"
              required
              maxLength={24}
              placeholder={t(
                "How you'll show on the leaderboard",
                'Cómo aparecerás en la tabla de posiciones',
              )}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />

            <div>
              <label>
                {t('Your emoji', 'Tu emoji')} {emoji && <span className="emoji-current">{emoji}</span>}
              </label>
              <EmojiPicker value={emoji} onChange={setEmoji} taken={takenEmojis} />
            </div>

            {error && <div className="notice notice-err">{error}</div>}
            {saved && <div className="notice notice-ok">{t('Profile saved ✓', 'Perfil guardado ✓')}</div>}

            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? t('Saving…', 'Guardando…') : t('Save profile', 'Guardar perfil')}
            </button>
          </form>
        </>
      ) : (
        <div className="form-card">
          <div className="profile-readonly">
            <span className="profile-emoji-lg">{profile?.emoji}</span>
            <div>
              <div className="profile-nick">{profile?.nickname}</div>
              <div className="muted small">
                {t('Your nickname & emoji are locked in.', 'Tu apodo y emoji quedaron fijados.')}
              </div>
            </div>
          </div>
        </div>
      )}

      <Link to="/rules" className="btn btn-ghost">
        📖 {t('Rules & scoring', 'Reglas y puntuación')}
      </Link>

      <div className="form-card" style={{ marginTop: '1rem' }}>
        <div className="muted">
          {t('Signed in as', 'Sesión iniciada como')} {session?.user.email}
        </div>
        <button className="btn btn-ghost" onClick={signOut}>
          {t('Sign out', 'Cerrar sesión')}
        </button>
      </div>
    </div>
  )
}
