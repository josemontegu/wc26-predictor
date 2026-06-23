import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function ProfilePage({ forced = false }: { forced?: boolean }) {
  const { session, profile, refreshProfile, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setNickname(profile.nickname ?? '')
    }
  }, [profile])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!session?.user) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), nickname: nickname.trim() })
      .eq('id', session.user.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setSaved(true)
    await refreshProfile()
  }

  return (
    <div className="page">
      <h1>{forced ? 'Set up your profile' : 'Your profile'}</h1>
      {forced && (
        <p className="muted">
          Before you can make predictions, choose how you'll appear on the leaderboard.
        </p>
      )}

      <form onSubmit={handleSave} className="form-card">
        <label htmlFor="display">Display name</label>
        <input
          id="display"
          type="text"
          required
          maxLength={40}
          placeholder="Your full name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <label htmlFor="nick">Nickname</label>
        <input
          id="nick"
          type="text"
          required
          maxLength={24}
          placeholder="Shown on the leaderboard"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />

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
