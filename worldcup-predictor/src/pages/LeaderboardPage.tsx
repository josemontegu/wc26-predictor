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
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Snapshot of ranks from the previous visit (captured once on mount).
  const prevRanks = useRef<Record<string, number>>(loadPrevRanks())

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
      await fetchRows()
      if (active) setLoading(false)
    })()

    // Live-update when results or predictions change.
    const channel = supabase
      .channel('leaderboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchRows())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () =>
        fetchRows(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awards' }, () => fetchRows())
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') setLive(true)
      })

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [fetchRows])

  // A confetti burst when you're sitting in first place (once per visit).
  const celebrated = useRef(false)
  useEffect(() => {
    if (celebrated.current) return
    const top = rows[0]
    const me = rows.find((r) => r.user_id === session?.user.id)
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
  }, [rows, session])

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

  const ranks = computeRanks(rows)
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean)
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const hasScores = (rows[0]?.total_points || 0) > 0

  // The tie-break criteria, in priority order, shown as subtle chips so it's
  // clear why players on equal points are ordered the way they are.
  const statChips = (r: LeaderboardRow) => (
    <>
      <span className="lb-stat" title={t('Exact scores', 'Marcadores exactos')}>
        <span className="lb-stat-ico">🎯</span>
        {r.exact_scores}
      </span>
      <span className="lb-stat" title={t('Correct advancing picks', 'Aciertos de avance')}>
        <span className="lb-stat-ico">✅</span>
        {r.correct_advances}
      </span>
    </>
  )

  return (
    <div className="page">
      <div className="lb-head">
        <h1>{t('Leaderboard', 'Tabla de posiciones')}</h1>
        {live && (
          <span className="live-chip">
            <span className="dot" /> {t('Live', 'En vivo')}
          </span>
        )}
      </div>
      {hasScores && (
        <p className="lb-caption">
          {t(
            'Points, then 🎯 exact scores, then ✅ correct picks',
            'Puntos, luego 🎯 marcadores exactos y ✅ aciertos',
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
                  <div key={r.user_id} className={`podium-col podium-${rank}`}>
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
                    <div className="podium-statline">{statChips(r)}</div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="lb-list">
            {(hasScores ? rest : rows).map((r) => {
              const isMe = r.user_id === session?.user.id
              const rank = ranks[r.user_id]
              const mv = movement(r, rank)
              return (
                <div key={r.user_id} className={`lb-row ${isMe ? 'lb-row-me' : ''}`}>
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
                    <div className="lb-statline">{statChips(r)}</div>
                  </div>
                  <div className="lb-stats">
                    <div className="lb-points">
                      <CountUp value={r.total_points} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      <p className="muted small" style={{ marginTop: '1rem' }}>
        {live
          ? t(
              'Updating live as results come in.',
              'Se actualiza en vivo a medida que llegan los resultados.',
            )
          : t(
              'Points update automatically as the admin enters results.',
              'Los puntos se actualizan automáticamente cuando el admin ingresa los resultados.',
            )}
      </p>
    </div>
  )
}
