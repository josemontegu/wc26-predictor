import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { LeaderboardRow } from '../lib/types'
import { avatarGradient } from '../lib/teamMeta'
import Spinner from '../components/Spinner'
import { useT } from '../lib/i18n'

const RANK_KEY = 'wc26_ranks'

function loadPrevRanks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(RANK_KEY) || '{}')
  } catch {
    return {}
  }
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
    const next = ((data as LeaderboardRow[]) ?? []).filter(
      (r) => (r.nickname ?? '').trim() !== '',
    )
    setRows(next)
    // Persist the latest ranks so the next visit can show movement.
    const snapshot: Record<string, number> = {}
    next.forEach((r, i) => (snapshot[r.user_id] = i + 1))
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

  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean)
  const podiumRank: Record<string, number> = {}
  top.forEach((r, i) => r && (podiumRank[r.user_id] = i + 1))
  const barHeights: Record<number, number> = { 1: 52, 2: 38, 3: 28 }
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const hasScores = (rows[0]?.total_points || 0) > 0

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
      {error && <div className="notice notice-err">{error}</div>}

      {rows.length === 0 ? (
        <p className="muted">{t('No players yet.', 'Aún no hay jugadores.')}</p>
      ) : (
        <>
          {hasScores && podiumOrder.length >= 2 && (
            <div className="podium">
              {podiumOrder.map((r) => {
                const rank = podiumRank[r.user_id]
                return (
                  <div key={r.user_id} className={`podium-col podium-${rank}`}>
                    <span className="podium-medal">{medals[rank]}</span>
                    <div
                      className={`podium-avatar ${r.emoji ? 'avatar-emoji' : ''}`}
                      style={r.emoji ? undefined : { background: avatarGradient(r.user_id) }}
                    >
                      {r.emoji || initials(r)}
                    </div>
                    <div className="podium-nick">{r.nickname || r.display_name}</div>
                    <div className="podium-pts">{r.total_points}</div>
                    <div className="podium-bar" style={{ height: barHeights[rank] }}>
                      {rank}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="lb-list">
            {(hasScores ? rest : rows).map((r, i) => {
              const isMe = r.user_id === session?.user.id
              const rank = hasScores ? i + 4 : i + 1
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
                    <div className="lb-sub">
                      {t(
                        `${r.correct_advances} adv · ${r.exact_scores} exact`,
                        `${r.correct_advances} avances · ${r.exact_scores} exactos`,
                      )}
                    </div>
                  </div>
                  <div className="lb-stats">
                    <div className="lb-points">{r.total_points}</div>
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
