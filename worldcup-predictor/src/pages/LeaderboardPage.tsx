import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { LeaderboardRow } from '../lib/types'
import { avatarGradient } from '../lib/teamMeta'
import { fireConfetti } from '../lib/confetti'
import Spinner from '../components/Spinner'
import { useT } from '../lib/i18n'

/** Animates a number up to its value (and between values on live updates). */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      fromRef.current = value
      return
    }
    let raf = 0
    let start: number | null = null
    const step = (now: number) => {
      if (start === null) start = now
      const p = Math.min(1, (now - start) / 800)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{display}</>
}

const RANK_KEY = 'wc26_ranks'

function loadPrevRanks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(RANK_KEY) || '{}')
  } catch {
    return {}
  }
}

/**
 * Standing per row. Rows must already be sorted (points → exact → advances).
 * Players who match on all three share a rank ("1, 2, 2, 4" style) — the name
 * only keeps the row order stable, it never changes a position.
 */
function computeRanks(rows: LeaderboardRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  let lastRank = 0
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    const tied =
      prev &&
      prev.total_points === r.total_points &&
      prev.exact_scores === r.exact_scores &&
      prev.correct_advances === r.correct_advances
    const rank = tied ? lastRank : i + 1
    out[r.user_id] = rank
    lastRank = rank
  })
  return out
}

export default function LeaderboardPage() {
  const t = useT()
  const { session } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The player whose stats card is open (null = closed).
  const [selected, setSelected] = useState<LeaderboardRow | null>(null)
  // Ids of shadow (unofficial) players — ranked & shown separately.
  const [shadowIds, setShadowIds] = useState<Set<string>>(new Set())
  // Snapshot of ranks from the previous visit (captured once on mount).
  const prevRanks = useRef<Record<string, number>>(loadPrevRanks())

  const fetchShadows = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, official')
    setShadowIds(
      new Set(
        ((data as { id: string; official: boolean }[]) ?? [])
          .filter((p) => p.official === false)
          .map((p) => p.id),
      ),
    )
  }, [])

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from('leaderboard').select('*')
    if (error) {
      setError(error.message)
      return
    }
    // Hide players who haven't finished onboarding (no nickname yet) so a
    // half-signed-up account never shows as a nameless "?" on the board.
    // Sort here too (not just in the DB view) so ranking is correct regardless
    // of what order the API returns: points → exact → advances, name last.
    const next = ((data as LeaderboardRow[]) ?? [])
      .filter((r) => (r.nickname ?? '').trim() !== '')
      .sort(
        (a, b) =>
          b.total_points - a.total_points ||
          b.exact_scores - a.exact_scores ||
          b.correct_advances - a.correct_advances ||
          (a.nickname || a.display_name || '').localeCompare(b.nickname || b.display_name || ''),
      )
    setRows(next)
    // Persist the latest (shared) ranks so the next visit can show movement.
    const snapshot = computeRanks(next)
    try {
      localStorage.setItem(RANK_KEY, JSON.stringify(snapshot))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      await Promise.all([fetchRows(), fetchShadows()])
      if (active) setLoading(false)
    })()

    // Live-update when results, predictions or player status change.
    const channel = supabase
      .channel('leaderboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchRows())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () =>
        fetchRows(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awards' }, () => fetchRows())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () =>
        fetchShadows(),
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [fetchRows, fetchShadows])

  // A confetti burst when you're sitting in first place (once per visit).
  const celebrated = useRef(false)
  useEffect(() => {
    if (celebrated.current) return
    // Only official players top the (official) board.
    const official = rows.filter((r) => !shadowIds.has(r.user_id))
    const top = official[0]
    const me = official.find((r) => r.user_id === session?.user.id)
    if (
      top &&
      me &&
      (top.total_points || 0) > 0 &&
      me.total_points === top.total_points &&
      me.exact_scores === top.exact_scores &&
      me.correct_advances === top.correct_advances
    ) {
      celebrated.current = true
      setTimeout(() => fireConfetti(), 450)
    }
  }, [rows, session, shadowIds])

  // Close the open stats card on Escape.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Leaderboard', 'Tabla de posiciones')}</h1>
        <Spinner label={t('Loading leaderboard…', 'Cargando tabla de posiciones…')} />
      </div>
    )
  }

  const initials = (r: LeaderboardRow) =>
    (r.nickname || r.display_name || '?')
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()

  const movement = (r: LeaderboardRow, currentRank: number) => {
    const prev = prevRanks.current[r.user_id]
    if (prev == null) return null
    const delta = prev - currentRank // positive = climbed
    if (delta === 0) return { dir: 'same' as const, n: 0 }
    return { dir: delta > 0 ? ('up' as const) : ('down' as const), n: Math.abs(delta) }
  }

  // Official players rank & take the podium; shadow (unofficial) players are
  // listed separately and never mixed into the standings.
  const official = rows.filter((r) => !shadowIds.has(r.user_id))
  const shadows = rows.filter((r) => shadowIds.has(r.user_id))
  const ranks = computeRanks(official)
  const top = official.slice(0, 3)
  const rest = official.slice(3)
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean)
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const hasScores = (official[0]?.total_points || 0) > 0
  // The worst rank on the board — the "wooden spoon" (only once results are in,
  // and only when there's a list below the podium). Ties share it.
  const lastRank =
    hasScores && rest.length > 0 ? Math.max(...official.map((r) => ranks[r.user_id])) : -1

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

  return (
    <div className="page">
      <div className="lb-head">
        <h1>{t('Leaderboard', 'Tabla de posiciones')}</h1>
      </div>
      {rows.length > 0 && (
        <p className="lb-caption">
          {t(
            'Ranked by points · tap a player for their stats',
            'Ordenado por puntos · toca a un jugador para ver sus estadísticas',
          )}
        </p>
      )}
      {error && <div className="notice notice-err">{error}</div>}

      {rows.length === 0 ? (
        <p className="muted">{t('No players yet.', 'Aún no hay jugadores.')}</p>
      ) : (
        <>
          {hasScores && podiumOrder.length >= 2 && (
            <div className="podium">
              {podiumOrder.map((r) => {
                const rank = ranks[r.user_id]
                return (
                  <button
                    key={r.user_id}
                    type="button"
                    className={`podium-col podium-${rank}`}
                    onClick={() => setSelected(r)}
                  >
                    {rank === 1 && <span className="podium-medal">👑</span>}
                    <div
                      className={`podium-avatar ${r.emoji ? 'avatar-emoji' : ''}`}
                      style={r.emoji ? undefined : { background: avatarGradient(r.user_id) }}
                    >
                      {r.emoji || initials(r)}
                    </div>
                    <div className="podium-rankmedal">{medals[rank]}</div>
                    <div className="podium-nick">{r.nickname || r.display_name}</div>
                    <div className="podium-pts">
                      <CountUp value={r.total_points} />
                      <span className="podium-pts-lbl"> {t('pts', 'pts')}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="lb-list">
            {(hasScores ? rest : official).map((r) => {
              const isMe = r.user_id === session?.user.id
              const rank = ranks[r.user_id]
              const mv = movement(r, rank)
              const isLast = rank === lastRank
              return (
                <button
                  key={r.user_id}
                  type="button"
                  className={`lb-row ${isMe ? 'lb-row-me' : ''} ${isLast ? 'lb-row-last' : ''}`}
                  onClick={() => setSelected(r)}
                >
                  <span className="lb-rank">
                    {rank}
                    {mv && mv.dir !== 'same' && (
                      <span className={`rank-move rank-${mv.dir}`}>
                        {mv.dir === 'up' ? '▲' : '▼'}
                        {mv.n}
                      </span>
                    )}
                  </span>
                  <span
                    className={`lb-avatar ${r.emoji ? 'avatar-emoji' : ''}`}
                    style={r.emoji ? undefined : { background: avatarGradient(r.user_id) }}
                  >
                    {r.emoji || initials(r)}
                  </span>
                  <div className="lb-id">
                    <div className="lb-nick">
                      {r.nickname || r.display_name}
                      {isMe && <span className="you-tag">{t('YOU', 'TÚ')}</span>}
                    </div>
                  </div>
                  <div className="lb-stats">
                    <div className="lb-points">
                      <CountUp value={r.total_points} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {shadows.length > 0 && (
            <div className="shadow-block">
              <div className="shadow-head">
                <span className="shadow-badge">{t('SHADOW', 'SOMBRA')}</span>
                <span className="shadow-head-txt">
                  {t('Shadow players · unofficial', 'Jugadores sombra · no oficial')}
                </span>
              </div>
              <div className="lb-list">
                {shadows.map((r) => {
                  const isMe = r.user_id === session?.user.id
                  return (
                    <button
                      key={r.user_id}
                      type="button"
                      className={`lb-row lb-row-shadow ${isMe ? 'lb-row-me' : ''}`}
                      onClick={() => setSelected(r)}
                    >
                      <span className="lb-rank lb-rank-shadow">•</span>
                      <span
                        className={`lb-avatar ${r.emoji ? 'avatar-emoji' : ''}`}
                        style={r.emoji ? undefined : { background: avatarGradient(r.user_id) }}
                      >
                        {r.emoji || initials(r)}
                      </span>
                      <div className="lb-id">
                        <div className="lb-nick">
                          {r.nickname || r.display_name}
                          {isMe && <span className="you-tag">{t('YOU', 'TÚ')}</span>}
                        </div>
                      </div>
                      <div className="lb-stats">
                        <div className="lb-points">
                          <CountUp value={r.total_points} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="pcard-overlay" onClick={() => setSelected(null)}>
          <div className="pcard" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pcard-close"
              onClick={() => setSelected(null)}
              aria-label={t('Close', 'Cerrar')}
            >
              ✕
            </button>
            <div className="pcard-head">
              <span
                className={`pcard-avatar ${selected.emoji ? 'avatar-emoji' : ''}`}
                style={selected.emoji ? undefined : { background: avatarGradient(selected.user_id) }}
              >
                {selected.emoji || initials(selected)}
              </span>
              <div className="pcard-id">
                <div className="pcard-nick">{selected.nickname || selected.display_name}</div>
                <div className="pcard-rank">
                  {shadowIds.has(selected.user_id) ? (
                    <span className="pcard-shadow">
                      {t('Shadow player · unofficial', 'Jugador sombra · no oficial')}
                    </span>
                  ) : (
                    <>
                      {medals[ranks[selected.user_id]] ?? ''} {t('Rank', 'Puesto')} #
                      {ranks[selected.user_id]}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pcard-points">
              <span className="pcard-pts-num">{selected.total_points}</span>
              <span className="pcard-pts-lbl"> {t('points', 'puntos')}</span>
            </div>

            <div className="pcard-stats">
              <div className="pcard-stat">
                <span className="pcard-stat-ico">🎯</span>
                <span className="pcard-stat-val">{selected.exact_scores}</span>
                <span className="pcard-stat-lbl">{t('exact scores', 'exactos')}</span>
              </div>
              <div className="pcard-stat">
                <span className="pcard-stat-ico">✅</span>
                <span className="pcard-stat-val">{selected.correct_advances}</span>
                <span className="pcard-stat-lbl">{t('advancing right', 'aciertos avance')}</span>
              </div>
              <div className="pcard-stat">
                <span className="pcard-stat-ico">📋</span>
                <span className="pcard-stat-val">{selected.scored_predictions}</span>
                <span className="pcard-stat-lbl">{t('matches scored', 'partidos')}</span>
              </div>
            </div>

            {selected.scored_predictions > 0 && (
              <div className="pcard-rates">
                {t(
                  `${pct(selected.exact_scores, selected.scored_predictions)}% exact · ${pct(selected.correct_advances, selected.scored_predictions)}% advancing accuracy`,
                  `${pct(selected.exact_scores, selected.scored_predictions)}% exactos · ${pct(selected.correct_advances, selected.scored_predictions)}% de avance`,
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="muted small" style={{ marginTop: '1rem' }}>
        {t(
          'Points update automatically as results come in.',
          'Los puntos se actualizan automáticamente a medida que llegan los resultados.',
        )}
      </p>
    </div>
  )
}
