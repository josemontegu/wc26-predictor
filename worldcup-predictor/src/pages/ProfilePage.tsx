import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'
import EmojiPicker from '../components/EmojiPicker'

export default function ProfilePage({ forced = false }: { forced?: boolean }) {
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
    if (!value) return setError('Please choose a nickname.')
    if (!emoji) return setError('Please pick an emoji.')

    const nameTaken = others.some(
      (p) => p.id !== myId && p.nickname.trim().toLowerCase() === value.toLowerCase(),
    )
    if (nameTaken) return setError(`"${value}" is already taken — pick another nickname.`)
    if (takenEmojis.has(emoji)) return setError('That emoji is taken — pick another.')

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
          ? 'That nickname or emoji is already taken — pick another.'
          : error.message,
      )
      return
    }
    setSaved(true)
    await refreshProfile()
  }

  return (
    <div className="page">
      <h1>{forced ? 'Set up your player' : 'Your profile'}</h1>

      {canEdit ? (
        <>
          {!isAdmin && (
            <div className="notice notice-info">
              ⚠️ Choose carefully — your nickname and emoji are set <strong>once</strong> and
              can't be changed afterwards.
            </div>
          )}
          <form onSubmit={handleSave} className="form-card">
            <label htmlFor="nick">Nickname</label>
            <input
              id="nick"
              type="text"
              required
              maxLength={24}
              placeholder="How you'll show on the leaderboard"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />

            <div>
              <label>
                Your emoji {emoji && <span className="emoji-current">{emoji}</span>}
              </label>
              <EmojiPicker value={emoji} onChange={setEmoji} taken={takenEmojis} />
            </div>

            {error && <div className="notice notice-err">{error}</div>}
            {saved && <div className="notice notice-ok">Profile saved ✓</div>}

            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </>
      ) : (
        <div className="form-card">
          <div className="profile-readonly">
            <span className="profile-emoji-lg">{profile?.emoji}</span>
            <div>
              <div className="profile-nick">{profile?.nickname}</div>
              <div className="muted small">Your nickname &amp; emoji are locked in.</div>
            </div>
          </div>
        </div>
      )}

      <Link to="/rules" className="btn btn-ghost">
        📖 Rules &amp; scoring
      </Link>

      <div className="form-card" style={{ marginTop: '1rem' }}>
        <div className="muted">Signed in as {session?.user.email}</div>
        <button className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
