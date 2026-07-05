import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type {
  AppConfig,
  LeaderboardRow,
  LockedPrediction,
  Match,
  Round,
  RoundCode,
} from '../lib/types'
import { avatarGradient, teamFlag, teamName } from '../lib/teamMeta'
import { roundName, ROUND_ORDER } from '../lib/format'
import { fireConfetti } from '../lib/confetti'
import Spinner from '../components/Spinner'
import { useT } from '../lib/i18n'

// The four drill-down categories on a player's stats card.
type StatKey = 'exact' | 'results' | 'advancing' | 'scored'
// One scored match for the open player: the result, their pick, what they got
// right, and the points it earned.
interface StatRow {
  m: Match
  p: LockedPrediction
  exact: boolean
  rightResult: boolean
  advancingRight: boolean
  points: number
}

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
function computeRanksBy(
  rows: LeaderboardRow[],
  keyFn: (r: LeaderboardRow) => string,
): Record<string, number> {
  const out: Record<string, number> = {}
  let lastRank = 0
  rows.forEach((r, i) => {
    const tied = i > 0 && keyFn(rows[i - 1]) === keyFn(r)
    const rank = tied ? lastRank : i + 1
    out[r.user_id] = rank
    lastRank = rank
  })
  return out
}

function computeRanks(rows: LeaderboardRow[]): Record<string, number> {
  return computeRanksBy(rows, (r) => `${r.total_points}|${r.exact_scores}|${r.correct_advances}`)
}

export default function LeaderboardPage() {
  const t = useT()
  const { session } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The player whose stats card is open (null = closed).
  const [selected, setSelected] = useState<LeaderboardRow | null>(null)
  // Which stat tile is drilled into (null = the four-tile summary).
  const [statDetail, setStatDetail] = useState<StatKey | null>(null)
  // Ids of shadow (unofficial) players — ranked & shown separately.
  const [shadowIds, setShadowIds] = useState<Set<string>>(new Set())
  // Which table to show: cumulative total, or a single round's points.
  const [view, setView] = useState<'total' | RoundCode>('total')
  // Inputs for the per-round view (points earned in each round).
  const [picks, setPicks] = useState<LockedPrediction[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  // Snapshot of ranks from the previous visit (captured once on mount).
  const prevRanks = useRef<Record<string, number>>(loadPrevRanks())

  const fetchRoundData = useCallback(async () => {
    const [p, m, cfg, rds] = await Promise.all([
      supabase.from('locked_predictions').select('*'),
      supabase.from('matches').select('*'),
      supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('rounds').select('*').order('sort_order'),
    ])
    setPicks((p.data as LockedPrediction[]) ?? [])
    setMatches((m.data as Match[]) ?? [])
    setConfig((cfg.data as AppConfig) ?? null)
    setRounds((rds.data as Round[]) ?? [])
  }, [])

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
      await Promise.all([fetchRows(), fetchShadows(), fetchRoundData()])
      if (active) setLoading(false)
    })()

    const refresh = () => {
      fetchRows()
      fetchRoundData()
    }
    // Live-update when results, predictions or player status change.
    const channel = supabase
      .channel('leaderboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awards' }, () => fetchRows())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () =>
        fetchShadows(),
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [fetchRows, fetchShadows, fetchRoundData])

  // Per-player, per-round stats: points (mirrors the DB prediction_scores
  // formula) plus exact-score and advancing counts — so the round view can
  // break ties exactly like the Total view (points → exact → advances).
  const roundStats = useMemo(() => {
    const out = new Map<string, Map<string, { pts: number; exact: number; adv: number }>>()
    if (!config) return out
    const multByRound = new Map(rounds.map((r) => [r.code, r.multiplier]))
    const matchById = new Map(matches.map((m) => [m.id, m]))
    for (const p of picks) {
      const m = matchById.get(p.match_id)
      if (!m || m.home_score == null || m.away_score == null) continue
      const mult = multByRound.get(m.round) ?? 1
      const exact = p.home_score === m.home_score && p.away_score === m.away_score ? 1 : 0
      const adv = m.advancing_team && p.advancing_team === m.advancing_team ? 1 : 0
      let pts = 0
      if (adv) pts += config.points_advance * mult
      if (exact) pts += config.points_exact * mult
      if (Math.sign(p.home_score - p.away_score) === Math.sign(m.home_score - m.away_score))
        pts += config.points_tendency * mult
      if (m.went_to_penalties != null && p.penalties === m.went_to_penalties)
        pts += config.points_penalties * mult
      if (pts === 0 && exact === 0 && adv === 0) continue
      let um = out.get(p.user_id)
      if (!um) {
        um = new Map()
        out.set(p.user_id, um)
      }
      const cur = um.get(m.round) ?? { pts: 0, exact: 0, adv: 0 }
      cur.pts += pts
      cur.exact += exact
      cur.adv += adv
      um.set(m.round, cur)
    }
    return out
  }, [picks, matches, config, rounds])

  // Correct results (right winner/draw) per player — a right result earns the
  // tendency points even when the exact score is missed, so it's the piece that
  // explains equal totals with different exact-score counts.
  const resultsByUser = useMemo(() => {
    const out = new Map<string, number>()
    const matchById = new Map(matches.map((m) => [m.id, m]))
    for (const p of picks) {
      const m = matchById.get(p.match_id)
      if (!m || m.home_score == null || m.away_score == null) continue
      if (Math.sign(p.home_score - p.away_score) === Math.sign(m.home_score - m.away_score))
        out.set(p.user_id, (out.get(p.user_id) ?? 0) + 1)
    }
    return out
  }, [picks, matches])

  // Every scored match for the open player, with what they got right and the
  // points it earned — the source for the per-tile drill-down. Ordered by
  // schedule (match number).
  const selectedRows = useMemo<StatRow[]>(() => {
    if (!selected || !config) return []
    const multByRound = new Map(rounds.map((r) => [r.code, r.multiplier]))
    const matchById = new Map(matches.map((m) => [m.id, m]))
    const rows: StatRow[] = []
    for (const p of picks) {
      if (p.user_id !== selected.user_id) continue
      const m = matchById.get(p.match_id)
      if (!m || m.home_score == null || m.away_score == null) continue
      const mult = multByRound.get(m.round) ?? 1
      const exact = p.home_score === m.home_score && p.away_score === m.away_score
      const rightResult =
        Math.sign(p.home_score - p.away_score) === Math.sign(m.home_score - m.away_score)
      const advancingRight = !!m.advancing_team && p.advancing_team === m.advancing_team
      let points = 0
      if (advancingRight) points += config.points_advance * mult
      if (exact) points += config.points_exact * mult
      if (rightResult) points += config.points_tendency * mult
      if (m.went_to_penalties != null && p.penalties === m.went_to_penalties)
        points += config.points_penalties * mult
      rows.push({ m, p, exact, rightResult, advancingRight, points })
    }
    rows.sort((a, b) => (a.m.match_no ?? 0) - (b.m.match_no ?? 0))
    return rows
  }, [selected, config, rounds, matches, picks])

  const roundsWithPoints = ROUND_ORDER.filter((rc) =>
    [...roundStats.values()].some((um) => (um.get(rc)?.pts ?? 0) > 0),
  )
  // Every round the tournament has, in order — upcoming ones are shown but
  // disabled until they're actually scored.
  const allRounds = ROUND_ORDER.filter((rc) => rounds.some((r) => r.code === rc))
  // A round we no longer have data for → fall back to Total.
  const activeView = view !== 'total' && roundsWithPoints.includes(view) ? view : 'total'
  const valueOf = (r: LeaderboardRow) =>
    activeView === 'total' ? r.total_points : (roundStats.get(r.user_id)?.get(activeView)?.pts ?? 0)
  // Round-specific tie-breakers, mirroring the Total view's exact → advances
  // order so a single-round view ranks identically to Total when that round is
  // the only one played.
  const exactOf = (r: LeaderboardRow) =>
    activeView === 'total' ? r.exact_scores : (roundStats.get(r.user_id)?.get(activeView)?.exact ?? 0)
  const advOf = (r: LeaderboardRow) =>
    activeView === 'total' ? r.correct_advances : (roundStats.get(r.user_id)?.get(activeView)?.adv ?? 0)

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

  // Escape backs out of a drill-down first, then closes the card.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setStatDetail((d) => (d ? null : (setSelected(null), null)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // Always reopen a card on its summary, never a stale drill-down.
  useEffect(() => {
    setStatDetail(null)
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
  const officialAll = rows.filter((r) => !shadowIds.has(r.user_id))
  const shadowAll = rows.filter((r) => shadowIds.has(r.user_id))
  // The stats card always shows a player's overall standing, regardless of view.
  const overallRanks = computeRanks(officialAll)

  // Re-order for the active view: Total keeps the overall order; a round reranks
  // by that round's points (ties share a place) — so late-joining guests can be
  // compared to everyone on the rounds they actually played.
  const byView = (list: LeaderboardRow[]) =>
    activeView === 'total'
      ? list
      : [...list].sort(
          (a, b) =>
            valueOf(b) - valueOf(a) ||
            exactOf(b) - exactOf(a) ||
            advOf(b) - advOf(a) ||
            (a.nickname || a.display_name || '').localeCompare(b.nickname || b.display_name || ''),
        )
  const official = byView(officialAll)
  const shadows = byView(shadowAll)
  const ranks =
    activeView === 'total'
      ? overallRanks
      : computeRanksBy(official, (r) => `${valueOf(r)}|${exactOf(r)}|${advOf(r)}`)
  const top = official.slice(0, 3)
  const rest = official.slice(3)
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean)
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const hasScores = official.length > 0 && valueOf(official[0]) > 0
  // The wooden spoon only makes sense on the official Total standing.
  const lastRank =
    activeView === 'total' && hasScores && rest.length > 0
      ? Math.max(...official.map((r) => ranks[r.user_id]))
      : -1

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  // How many matches have a final result — the denominator for a player's
  // coverage (how much of the played tournament they actually predicted).
  const playedCount = matches.filter((m) => m.home_score != null && m.away_score != null).length

  // Per-tile drill-down: icon, label and which scored matches it lists.
  const statMeta: Record<StatKey, { ico: string; label: string; keep: (r: StatRow) => boolean }> = {
    exact: { ico: '🎯', label: t('exact scores', 'exactos'), keep: (r) => r.exact },
    results: { ico: '🏁', label: t('right results', 'resultados'), keep: (r) => r.rightResult },
    advancing: { ico: '✅', label: t('advancing right', 'aciertos avance'), keep: (r) => r.advancingRight },
    scored: { ico: '📋', label: t('matches scored', 'partidos'), keep: () => true },
  }
  const detailMeta = statDetail ? statMeta[statDetail] : null
  const detailList = detailMeta ? selectedRows.filter(detailMeta.keep) : []

  return (
    <div className="page">
      <div className="lb-head">
        <h1>{t('Leaderboard', 'Tabla de posiciones')}</h1>
      </div>
      {rows.length > 0 && (
        <p className="lb-caption">
          {activeView === 'total'
            ? t(
                'Ranked by points · tap a player for their stats',
                'Ordenado por puntos · toca a un jugador para ver sus estadísticas',
              )
            : t(
                `${roundName(activeView)} points · tap a player for their stats`,
                `Puntos de ${roundName(activeView)} · toca a un jugador para ver sus estadísticas`,
              )}
        </p>
      )}

      {roundsWithPoints.length > 0 && (
        <div className="round-tabs lb-view-tabs">
          <button
            type="button"
            className={`round-tab ${activeView === 'total' ? 'round-tab-active' : ''}`}
            onClick={() => setView('total')}
          >
            {t('Total', 'Total')}
          </button>
          {allRounds.map((rc) => {
            const ready = roundsWithPoints.includes(rc)
            return (
              <button
                key={rc}
                type="button"
                disabled={!ready}
                className={`round-tab ${activeView === rc ? 'round-tab-active' : ''} ${ready ? '' : 'round-tab-soon'}`}
                onClick={() => ready && setView(rc)}
                title={ready ? undefined : t('Not started yet', 'Aún no comienza')}
              >
                {rc}
              </button>
            )
          })}
        </div>
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
                      <CountUp value={valueOf(r)} />
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
              const mv = activeView === 'total' ? movement(r, rank) : null
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
                      <span
                        className={`rank-move rank-${mv.dir}`}
                        role="img"
                        aria-label={
                          mv.dir === 'up'
                            ? t(`up ${mv.n}`, `sube ${mv.n}`)
                            : t(`down ${mv.n}`, `baja ${mv.n}`)
                        }
                      >
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
                      <CountUp value={valueOf(r)} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {shadows.length > 0 && (
            <div className="shadow-block">
              <div className="shadow-head">
                <span className="shadow-badge">{t('Guests', 'Invitados')}</span>
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
                          <CountUp value={valueOf(r)} />
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
                      {t('Guest · unofficial', 'Invitado · no oficial')}
                    </span>
                  ) : (
                    <>
                      {medals[overallRanks[selected.user_id]] ?? ''} {t('Rank', 'Puesto')} #
                      {overallRanks[selected.user_id]}
                    </>
                  )}
                </div>
              </div>
            </div>

            {detailMeta ? (
              <div className="pcard-detail">
                <div className="pcard-detail-bar">
                  <button
                    type="button"
                    className="pcard-detail-back"
                    onClick={() => setStatDetail(null)}
                  >
                    ← {t('Back', 'Volver')}
                  </button>
                  <span className="pcard-detail-heading">
                    {detailMeta.ico} {detailMeta.label} · {detailList.length}
                  </span>
                </div>
                {detailList.length === 0 ? (
                  <p className="muted small pcard-detail-empty">{t('None yet.', 'Nada aún.')}</p>
                ) : (
                  <ul className="pcard-detail-list">
                    {detailList.map((r) => (
                      <li className="pcard-detail-row" key={r.m.id}>
                        <div className="pcard-detail-line">
                          <span className="pcard-detail-round">{r.m.round}</span>
                          <span className="pcard-detail-teams">
                            {teamFlag(r.m.home_team)} {teamName(r.m.home_team)}
                            <b className="pcard-detail-score">
                              {' '}
                              {r.m.home_score}–{r.m.away_score}{' '}
                            </b>
                            {teamName(r.m.away_team)} {teamFlag(r.m.away_team)}
                          </span>
                          <span className={`pcard-detail-pts ${r.points === 0 ? 'is-zero' : ''}`}>
                            +{r.points}
                          </span>
                        </div>
                        <div className="pcard-detail-pick">
                          {t('Pick', 'Pron.')}: {r.p.home_score}–{r.p.away_score} ·{' '}
                          {teamName(r.p.advancing_team)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                <div className="pcard-points">
                  <span className="pcard-pts-num">{selected.total_points}</span>
                  <span className="pcard-pts-lbl"> {t('points', 'puntos')}</span>
                </div>

                <div className="pcard-stats">
                  <button
                    type="button"
                    className="pcard-stat pcard-stat-btn"
                    onClick={() => setStatDetail('exact')}
                  >
                    <span className="pcard-stat-ico">🎯</span>
                    <span className="pcard-stat-val">{selected.exact_scores}</span>
                    <span className="pcard-stat-lbl">{t('exact scores', 'exactos')}</span>
                    <span className="pcard-stat-pct">
                      ({pct(selected.exact_scores, selected.scored_predictions)}%)
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pcard-stat pcard-stat-btn"
                    onClick={() => setStatDetail('results')}
                  >
                    <span className="pcard-stat-ico">🏁</span>
                    <span className="pcard-stat-val">{resultsByUser.get(selected.user_id) ?? 0}</span>
                    <span className="pcard-stat-lbl">{t('right results', 'resultados')}</span>
                    <span className="pcard-stat-pct">
                      ({pct(resultsByUser.get(selected.user_id) ?? 0, selected.scored_predictions)}%)
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pcard-stat pcard-stat-btn"
                    onClick={() => setStatDetail('advancing')}
                  >
                    <span className="pcard-stat-ico">✅</span>
                    <span className="pcard-stat-val">{selected.correct_advances}</span>
                    <span className="pcard-stat-lbl">{t('advancing right', 'aciertos avance')}</span>
                    <span className="pcard-stat-pct">
                      ({pct(selected.correct_advances, selected.scored_predictions)}%)
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pcard-stat pcard-stat-btn"
                    onClick={() => setStatDetail('scored')}
                  >
                    <span className="pcard-stat-ico">📋</span>
                    <span className="pcard-stat-val">{selected.scored_predictions}</span>
                    <span className="pcard-stat-lbl">{t('matches scored', 'partidos')}</span>
                    <span className="pcard-stat-pct">
                      ({pct(selected.scored_predictions, playedCount)}%)
                    </span>
                  </button>
                </div>
              </>
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
