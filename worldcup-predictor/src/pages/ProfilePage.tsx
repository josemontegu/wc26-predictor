import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'

export default function ProfilePage({ forced = false }: { forced?: boolean }) {
  const { session, profile, refreshProfile, signOut } = useAuth()
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) setNickname(profile.nickname ?? '')
  }, [profile])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!session?.user) return
    const value = nickname.trim()
    if (!value) {
      setError('Please choose a nickname.')
      return
    }
    setBusy(true)
    setError(null)
    setSaved(false)

    // Enforce a unique nickname (case-insensitive) across players.
    const { data: others } = await supabase.from('profiles').select('id, nickname')
    const taken = ((others as Pick<Profile, 'id' | 'nickname'>[]) ?? []).some(
      (p) => p.id !== session.user.id && p.nickname.trim().toLowerCase() === value.toLowerCase(),
    )
    if (taken) {
      setBusy(false)
      setError(`"${value}" is already taken — pick another nickname.`)
      return
    }

    // display_name is kept in sync with the nickname (used elsewhere internally).
    const { error } = await supabase
      .from('profiles')
      .update({ nickname: value, display_name: value })
      .eq('id', session.user.id)
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? `"${value}" is already taken — pick another nickname.`
          : error.message,
      )
      return
    }
    setSaved(true)
    await refreshProfile()
  }

  return (
    <div className="page">
      <h1>{forced ? 'Choose your nickname' : 'Your profile'}</h1>
      {forced && (
        <p className="muted">
          Pick the nickname you'll go by on the leaderboard. It has to be unique.
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

        {error && <div className="notice notice-err">{error}</div>}
        {saved && <div className="notice notice-ok">Nickname saved ✓</div>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save nickname'}
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
