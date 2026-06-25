import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Award, AwardPrediction } from '../lib/types'
import { awardLocked } from '../lib/types'
import { formatLock, timeUntilLock } from '../lib/format'
import Spinner from '../components/Spinner'
import AwardPicker from '../components/AwardPicker'

const AWARD_ICON: Record<string, string> = {
  champion: '🏆',
  golden_ball: '⚽',
  golden_boot: '👟',
  golden_glove: '🧤',
}

export default function AwardsPage() {
  const { session } = useAuth()
  const [awards, setAwards] = useState<Award[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({}) // last-saved value per award
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      const [awardRes, predRes] = await Promise.all([
        supabase.from('awards').select('*').order('sort_order'),
        supabase.from('award_predictions').select('*').eq('user_id', session!.user.id),
      ])
      if (!active) return
      if (awardRes.error) setError(awardRes.error.message)
      setAwards((awardRes.data as Award[]) ?? [])
      const byAward: Record<string, string> = {}
      for (const p of (predRes.data as AwardPrediction[]) ?? []) byAward[p.award_id] = p.pick
      setPicks(byAward)
      setSaved(byAward)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [session])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!session?.user) return
    setBusy(true)
    setError(null)
    setDone(false)

    // Upsert only the open awards whose pick changed and is non-empty.
    const rows = awards
      .filter((a) => !awardLocked(a))
      .filter((a) => (picks[a.id] ?? '').trim() && (picks[a.id] ?? '').trim() !== (saved[a.id] ?? ''))
      .map((a) => ({
        user_id: session.user.id,
        award_id: a.id,
        pick: picks[a.id].trim(),
      }))

    if (rows.length === 0) {
      setBusy(false)
      setDone(true)
      return
    }

    const { error } = await supabase
      .from('award_predictions')
      .upsert(rows, { onConflict: 'user_id,award_id' })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    const nextSaved = { ...saved }
    rows.forEach((r) => (nextSaved[r.award_id] = r.pick))
    setSaved(nextSaved)
    setDone(true)
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Awards</h1>
        <Spinner label="Loading awards…" />
      </div>
    )
  }

  const anyOpen = awards.some((a) => !awardLocked(a))

  return (
    <div className="page">
      <h1>🏅 Tournament awards</h1>
      <p className="muted small">
        Call the champion and the individual award winners. Worth big points — editable
        until they lock before kick-off.
      </p>
      {error && <div className="notice notice-err">{error}</div>}

      {awards.length === 0 ? (
        <p className="muted">No awards set up yet.</p>
      ) : (
        <form onSubmit={handleSave}>
          {awards.map((a) => {
            const locked = awardLocked(a)
            const decided = a.winner != null && a.winner !== ''
            const myPick = picks[a.id] ?? ''
            const got = decided && myPick.trim().toLowerCase() === a.winner!.trim().toLowerCase()
            return (
              <div key={a.id} className={`award-card ${a.kind === 'team' ? 'award-champion' : ''}`}>
                <div className="award-head">
                  <span className="award-icon">{AWARD_ICON[a.key] ?? '🏅'}</span>
                  <div className="award-title">
                    <div className="award-name">{a.name}</div>
                    {a.description && <div className="muted small">{a.description}</div>}
                  </div>
                  <span className="award-points">{a.points} pts</span>
                </div>

                <AwardPicker
                  kind={a.kind}
                  value={myPick}
                  disabled={locked || decided}
                  onChange={(v) => setPicks((p) => ({ ...p, [a.id]: v }))}
                />

                <div className="award-foot">
                  {decided ? (
                    <span className={`award-status ${got ? 'award-hit' : 'award-miss'}`}>
                      Winner: {a.winner} {got ? `· +${a.points} pts ✓` : '· +0'}
                    </span>
                  ) : locked ? (
                    <span className="muted small">🔒 Locked · awaiting result</span>
                  ) : (
                    <span className="muted small">
                      🔓 Closes in {timeUntilLock(a.lock_time)}
                      {a.lock_time ? ` · ${formatLock(a.lock_time)}` : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {anyOpen && (
            <>
              {done && <div className="notice notice-ok">Award picks saved ✓</div>}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save my picks'}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  )
}
