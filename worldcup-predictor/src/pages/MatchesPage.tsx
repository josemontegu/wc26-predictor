import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Match, MyScore, Prediction, RoundCode } from '../lib/types'
import { isLocked, hasResult } from '../lib/types'
import { isTBD } from '../lib/teamMeta'
import { roundName, ROUND_ORDER, formatDay, timeUntilLock } from '../lib/format'
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

  const load = useCallback(async () => {
    const [matchRes, predRes, scoreRes] = await Promise.all([
      supabase.from('matches').select('*').order('match_no', { ascending: true }),
      supabase.from('predictions').select('*').eq('user_id', session!.user.id),
      supabase.from('my_scores').select('*'),
    ])
    if (matchRes.error) setError(matchRes.error.message)
    else setMatches((matchRes.data as Match[]) ?? [])

    const byMatch: Record<string, Prediction> = {}
    for (const p of (predRes.data as Prediction[]) ?? []) byMatch[p.match_id] = p
    setPredictions(byMatch)

    const ptsByMatch: Record<string, number> = {}
    for (const s of (scoreRes.data as MyScore[]) ?? []) ptsByMatch[s.match_id] = s.total_points
    setPoints(ptsByMatch)
  }, [session])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      await load()
      if (active) setLoading(false)
    })()

    // Refresh in place when a result is written, so friends watching while the
    // admin sleeps see final scores (and their points) appear without reloading.
    const channel = supabase
      .channel('matches-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => load())
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [load])

  // Matches still open (not locked, not played) with resolved teams that the
  // viewer hasn't predicted — so we can nudge them before they lock. Soonest to
  // close first.
  const needsPick = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            !hasResult(m) &&
            !isLocked(m) &&
            !isTBD(m.home_team) &&
            !isTBD(m.away_team) &&
            !predictions[m.id],
        )
        .sort((a, b) => {
          const la = a.lock_time ? new Date(a.lock_time).getTime() : Infinity
          const lb = b.lock_time ? new Date(b.lock_time).getTime() : Infinity
          return la - lb
        }),
    [matches, predictions],
  )
  const needsByRound = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of needsPick) m.set(x.round, (m.get(x.round) ?? 0) + 1)
    return m
  }, [needsPick])
  // Rounds (in order) that still have unpicked matches — so the nudge can name
  // where they are, instead of implying the current round is incomplete.
  const needRounds = useMemo(
    () => ROUND_ORDER.filter((r) => (needsByRound.get(r) ?? 0) > 0),
    [needsByRound],
  )

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

      {needsPick.length > 0 && (
        <div className="pick-nudge">
          <span className="pick-nudge-ico">⚠️</span>
          <span>
            {needRounds.length === 1
              ? t(
                  `You still have ${needsPick.length} match${needsPick.length === 1 ? '' : 'es'} to predict in the ${roundName(needRounds[0])}`,
                  `Te ${needsPick.length === 1 ? 'queda' : 'quedan'} ${needsPick.length} partido${needsPick.length === 1 ? '' : 's'} por pronosticar en ${roundName(needRounds[0])}`,
                )
              : t(
                  `You still have ${needsPick.length} match${needsPick.length === 1 ? '' : 'es'} to predict`,
                  `Te ${needsPick.length === 1 ? 'queda' : 'quedan'} ${needsPick.length} partido${needsPick.length === 1 ? '' : 's'} por pronosticar`,
                )}
            {needsPick[0].lock_time && (
              <span className="pick-nudge-when">
                {' · '}
                {t(
                  `next closes in ${timeUntilLock(needsPick[0].lock_time)}`,
                  `el próximo cierra en ${timeUntilLock(needsPick[0].lock_time)}`,
                )}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="round-tabs">
        {(roundsPresent.length ? roundsPresent : ROUND_ORDER).map((r) => {
          const need = needsByRound.get(r) ?? 0
          return (
            <button
              key={r}
              className={`round-tab ${activeRound === r ? 'round-tab-active' : ''}`}
              onClick={() => setActiveRound(r)}
            >
              {r}
              {need > 0 && <span className="round-tab-badge">{need}</span>}
            </button>
          )
        })}
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
