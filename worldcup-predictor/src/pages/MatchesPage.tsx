import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Match, MyScore, Prediction, RoundCode } from '../lib/types'
import { ROUND_NAMES, ROUND_ORDER } from '../lib/format'
import MatchCard from '../components/MatchCard'

export default function MatchesPage() {
  const { session } = useAuth()
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({})
  const [points, setPoints] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeRound, setActiveRound] = useState<RoundCode>('R32')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [matchRes, predRes, scoreRes] = await Promise.all([
        supabase.from('matches').select('*').order('match_no', { ascending: true }),
        supabase.from('predictions').select('*').eq('user_id', session!.user.id),
        supabase.from('my_scores').select('*'),
      ])
      if (!active) return
      if (matchRes.error) setError(matchRes.error.message)
      else setMatches((matchRes.data as Match[]) ?? [])

      const byMatch: Record<string, Prediction> = {}
      for (const p of (predRes.data as Prediction[]) ?? []) byMatch[p.match_id] = p
      setPredictions(byMatch)

      const ptsByMatch: Record<string, number> = {}
      for (const s of (scoreRes.data as MyScore[]) ?? []) ptsByMatch[s.match_id] = s.total_points
      setPoints(ptsByMatch)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [session])

  const roundsPresent = useMemo(() => {
    const set = new Set(matches.map((m) => m.round))
    return ROUND_ORDER.filter((r) => set.has(r))
  }, [matches])

  const visible = useMemo(
    () => matches.filter((m) => m.round === activeRound),
    [matches, activeRound],
  )

  if (loading) {
    return (
      <div className="page">
        <h1>Knockout matches</h1>
        <div className="skeleton-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Knockout matches</h1>
      {error && <div className="notice notice-err">{error}</div>}

      <div className="round-tabs">
        {(roundsPresent.length ? roundsPresent : ROUND_ORDER).map((r) => (
          <button
            key={r}
            className={`round-tab ${activeRound === r ? 'round-tab-active' : ''}`}
            onClick={() => setActiveRound(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <h2 className="round-title">
        {ROUND_NAMES[activeRound]}
        <span className="count">
          {visible.length} {visible.length === 1 ? 'match' : 'matches'}
        </span>
      </h2>

      {visible.length === 0 ? (
        <p className="muted">No matches in this round yet.</p>
      ) : (
        <div className="match-list">
          {visible.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              prediction={predictions[m.id]}
              points={points[m.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
