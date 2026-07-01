import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Match, MyScore, Prediction, RoundCode } from '../lib/types'
import { roundName, ROUND_ORDER, formatDay } from '../lib/format'
import { useT } from '../lib/i18n'
import MatchCard from '../components/MatchCard'

export default function MatchesPage() {
  const { session } = useAuth()
  const t = useT()
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

  // Group into calendar days, then order for a live tournament: today first
  // (pinned), then upcoming days soonest-first, then past days most-recent-first,
  // undated last. Matches within a day stay in kick-off order.
  const dayGroups = useMemo(() => {
    const ms = (n: string | null) => (n ? new Date(n).getTime() : Infinity)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const todayStart = start.getTime()
    const todayEnd = todayStart + 24 * 3600_000

    const sorted = [...visible].sort(
      (a, b) => ms(a.kickoff_time) - ms(b.kickoff_time) || (a.match_no ?? 0) - (b.match_no ?? 0),
    )
    // zone: 0 = today, 1 = upcoming, 2 = past, 3 = undated
    const zoneOf = (ts: number) =>
      ts === Infinity ? 3 : ts >= todayStart && ts < todayEnd ? 0 : ts < todayStart ? 2 : 1
    const groups: { key: string; items: Match[]; ts: number; zone: number }[] = []
    for (const m of sorted) {
      const key = m.kickoff_time ? new Date(m.kickoff_time).toDateString() : 'tbd'
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.items.push(m)
      else {
        const ts = ms(m.kickoff_time)
        groups.push({ key, items: [m], ts, zone: zoneOf(ts) })
      }
    }
    return groups.sort((a, b) =>
      a.zone !== b.zone ? a.zone - b.zone : a.zone === 2 ? b.ts - a.ts : a.ts - b.ts,
    )
  }, [visible])

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Knockout matches', 'Partidos de eliminación')}</h1>
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
      <h1>{t('Knockout matches', 'Partidos de eliminación')}</h1>
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
        {roundName(activeRound)}
        <span className="count">
          {visible.length} {visible.length === 1 ? t('match', 'partido') : t('matches', 'partidos')}
        </span>
      </h2>

      {visible.length === 0 ? (
        <p className="muted">{t('No matches in this round yet.', 'Aún no hay partidos en esta ronda.')}</p>
      ) : (
        <div className="match-list">
          {dayGroups.map((g, i) => {
            const zoneLabels: Record<number, string> = {
              0: t('Today', 'Hoy'),
              1: t('Upcoming', 'Próximos'),
              2: t('Played', 'Jugados'),
              3: t('To be scheduled', 'Por definir'),
            }
            const zoneNames = ['today', 'future', 'past', 'tbd']
            const newZone = i === 0 || dayGroups[i - 1].zone !== g.zone
            return (
              <div key={g.key} className="match-day-group">
                {newZone && (
                  <div className={`match-zone match-zone-${zoneNames[g.zone]}`}>
                    <span className="match-zone-line" />
                    <span className="match-zone-label">{zoneLabels[g.zone]}</span>
                    <span className="match-zone-line" />
                  </div>
                )}
                <div className="match-day">{formatDay(g.items[0].kickoff_time)}</div>
                {g.items.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions[m.id]}
                    points={points[m.id]}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
