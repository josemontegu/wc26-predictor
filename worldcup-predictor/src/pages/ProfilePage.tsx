import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'
import { PROFILE_EMOJIS } from '../lib/emojis'

export default function ProfilePage({ forced = false }: { forced?: boolean }) {
  const { session, profile, refreshProfile, signOut } = useAuth()
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
      {forced && (
        <p className="muted">
          Pick a nickname and an emoji to go by on the leaderboard. Both have to be unique.
        </p>
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
          <div className="emoji-grid">
            {PROFILE_EMOJIS.map((em) => {
              const taken = takenEmojis.has(em)
              return (
                <button
                  type="button"
                  key={em}
                  className={`emoji-opt ${emoji === em ? 'emoji-selected' : ''}`}
                  disabled={taken && emoji !== em}
                  title={taken ? 'Taken' : undefined}
                  onClick={() => setEmoji(em)}
                >
                  {em}
                </button>
              )
            })}
          </div>
        </div>

        {error && <div className="notice notice-err">{error}</div>}
        {saved && <div className="notice notice-ok">Profile saved ✓</div>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <div className="form-card">
        <div className="muted">Signed in as {session?.user.email}</div>
        <button className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
