import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  AppConfig,
  LeaderboardRow,
  LockedPrediction,
  Match,
  PlayerStat,
  Round,
} from '../lib/types'
import { roundName, ROUND_ORDER } from '../lib/format'
import Spinner from '../components/Spinner'
import { useT, type TFn } from '../lib/i18n'

const CAT_ES: Record<string, string> = {
  Advance: 'Avance',
  Exact: 'Exacto',
  Result: 'Resultado',
  Awards: 'Premios',
}
function catLabel(label: string, t: TFn) {
  return t(label, CAT_ES[label] ?? label)
}

// Four clearly-separated hues (green / blue / purple / gold) so the stacked
// bars stay legible — the old palette used two near-identical greens.
const CATS = [
  { key: 'pts_advance', label: 'Advance', color: '#12b886' },
  { key: 'pts_exact', label: 'Exact', color: '#4c6ef5' },
  { key: 'pts_tendency', label: 'Result', color: '#cc5de8' },
  { key: 'pts_awards', label: 'Awards', color: '#f59f00' },
] as const

// One colour per knockout round, for the "by round" points breakdown.
const ROUND_COLORS: Record<string, string> = {
  R32: '#15aabf',
  R16: '#4263eb',
  QF: '#7048e8',
  SF: '#e8590c',
  TP: '#868e96',
  F: '#f59f00',
}

export default function StatsPage() {
  const t = useT()
  const [board, setBoard] = useState<LeaderboardRow[]>([])
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [picks, setPicks] = useState<LockedPrediction[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  // How the points-distribution bars are coloured.
  const [mode, setMode] = useState<'total' | 'source' | 'round'>('total')
  // Superlatives are collapsed to a preview by default — there are ~11.
  const [showAllSupers, setShowAllSupers] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('leaderboard').select('*'),
      supabase.from('player_stats').select('*'),
      supabase.from('locked_predictions').select('*'),
      supabase.from('matches').select('*'),
      supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('rounds').select('*').order('sort_order'),
      supabase.from('profiles').select('id, official'),
    ]).then(([b, s, p, m, cfg, rds, prof]) => {
      if (!active) return
      // Exclude players who haven't set a nickname yet (incomplete sign-ups),
      // and shadow (unofficial) players — pool stats are official-only.
      const named = (n: string | null | undefined) => (n ?? '').trim() !== ''
      const shadow = new Set(
        ((prof.data as { id: string; official: boolean }[]) ?? [])
          .filter((pr) => pr.official === false)
          .map((pr) => pr.id),
      )
      const official = (id: string) => !shadow.has(id)
      setBoard(((b.data as LeaderboardRow[]) ?? []).filter((r) => named(r.nickname) && official(r.user_id)))
      setStats(((s.data as PlayerStat[]) ?? []).filter((r) => named(r.nickname) && official(r.user_id)))
      setPicks(((p.data as LockedPrediction[]) ?? []).filter((pk) => official(pk.user_id)))
      setMatches((m.data as Match[]) ?? [])
      setConfig((cfg.data as AppConfig) ?? null)
      setRounds((rds.data as Round[]) ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const goals = useMemo(() => {
    const played = matches.filter((m) => m.home_score != null && m.away_score != null)
    const playedIds = new Set(played.map((m) => m.id))
    const actual = played.length
      ? played.reduce((s, m) => s + (m.home_score ?? 0) + (m.away_score ?? 0), 0) / played.length
      : 0
    const onPlayed = picks.filter((p) => playedIds.has(p.match_id))
    const predicted = onPlayed.length
      ? onPlayed.reduce((s, p) => s + p.home_score + p.away_score, 0) / onPlayed.length
      : 0
    return { actual, predicted, playedCount: played.length }
  }, [matches, picks])

  // Superlatives — objective titles computed from revealed picks + results.
  const supers = useMemo(() => {
    const byUser = new Map<string, LockedPrediction[]>()
    for (const p of picks) {
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, [])
      byUser.get(p.user_id)!.push(p)
    }
    const lockedTotal = new Set(picks.map((p) => p.match_id)).size

    const advCounts = new Map<string, Map<string, number>>()
    const scoreCounts = new Map<string, Map<string, number>>()
    for (const p of picks) {
      const am = advCounts.get(p.match_id) ?? new Map()
      am.set(p.advancing_team, (am.get(p.advancing_team) ?? 0) + 1)
      advCounts.set(p.match_id, am)
      const sm = scoreCounts.get(p.match_id) ?? new Map()
      const k = `${p.home_score}-${p.away_score}`
      sm.set(k, (sm.get(k) ?? 0) + 1)
      scoreCounts.set(p.match_id, sm)
    }
    const plurality = new Map<string, string>()
    for (const [mid, am] of advCounts) {
      let best = ''
      let n = -1
      for (const [t, c] of am) if (c > n) ((best = t), (n = c))
      plurality.set(mid, best)
    }

    const scoredTotal = matches.filter((m) => m.home_score != null).length
    const skillThresh = Math.max(2, Math.ceil(scoredTotal * 0.5))
    const crowdThresh = Math.max(2, Math.ceil(lockedTotal * 0.5))

    // Who actually advanced in each match, plus match order — for streaks.
    const resultByMatch = new Map<string, { advancing: string | null; no: number; scored: boolean }>()
    for (const m of matches) {
      resultByMatch.set(m.id, {
        advancing: m.advancing_team,
        no: m.match_no ?? 0,
        scored: m.home_score != null && m.away_score != null,
      })
    }

    const recs = stats.map((s) => {
      const ps = byUser.get(s.user_id) ?? []
      const n = ps.length
      let withCrowd = 0
      let unique = 0
      for (const p of ps) {
        if (plurality.get(p.match_id) === p.advancing_team) withCrowd++
        if (scoreCounts.get(p.match_id)?.get(`${p.home_score}-${p.away_score}`) === 1) unique++
      }
      // Longest run of correct advancing picks, walking matches in order.
      const scoredSeq = ps
        .filter((p) => resultByMatch.get(p.match_id)?.scored)
        .sort(
          (a, b) =>
            (resultByMatch.get(a.match_id)?.no ?? 0) - (resultByMatch.get(b.match_id)?.no ?? 0),
        )
      let run = 0
      let bestRun = 0
      for (const p of scoredSeq) {
        const actual = resultByMatch.get(p.match_id)?.advancing
        if (actual && p.advancing_team === actual) {
          run += 1
          if (run > bestRun) bestRun = run
        } else {
          run = 0
        }
      }
      return {
        nick: s.nickname,
        emoji: s.emoji,
        skillN: s.scored,
        crowdN: n,
        exact: s.exact_scores,
        exactRate: s.scored ? s.exact_scores / s.scored : null,
        advanceAcc: s.scored ? s.correct_advances / s.scored : null,
        zero: s.zero_points,
        goalsAvg: n ? ps.reduce((a, p) => a + p.home_score + p.away_score, 0) / n : null,
        pensShare: n ? ps.filter((p) => p.penalties).length / n : null,
        sheep: n ? withCrowd / n : null,
        maverick: n ? (n - withCrowd) / n : null,
        unique,
        streak: bestRun,
        reliable: s.scored ? (s.scored - s.zero_points) / s.scored : null,
      }
    })
    type Rec = (typeof recs)[number]

    function winner(
      qual: (r: Rec) => boolean,
      val: (r: Rec) => number | null,
      dir: 'max' | 'min',
      suppressZero: boolean,
    ) {
      const cands = recs
        .filter(qual)
        .map((r) => ({ r, v: val(r) }))
        .filter((c): c is { r: Rec; v: number } => c.v != null)
      if (!cands.length) return null
      const best = dir === 'max' ? Math.max(...cands.map((c) => c.v)) : Math.min(...cands.map((c) => c.v))
      if (suppressZero && best === 0) return null
      return cands.filter((c) => c.v === best).map((c) => c.r)
    }
    const skillQ = (r: Rec) => r.skillN >= skillThresh
    const crowdQ = (r: Rec) => r.crowdN >= crowdThresh

    return [
      { icon: '🎯', title: t('Sniper', 'Francotirador'), desc: t('Highest exact-score rate', 'Mayor tasa de marcadores exactos'), win: winner(skillQ, (r) => r.exactRate, 'max', true), fmt: (r: Rec) => t(`${r.exact} exact`, `${r.exact} exactos`) },
      { icon: '🔮', title: t('Oracle', 'Oráculo'), desc: t('Best advance accuracy (correct ÷ scored)', 'Mejor precisión de avance (aciertos ÷ puntuados)'), win: winner(skillQ, (r) => r.advanceAcc, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.advanceAcc ?? 0) * 100)}% right`, `${Math.round((r.advanceAcc ?? 0) * 100)}% acertados`) },
      { icon: '🔥', title: t('On Fire', 'En Racha'), desc: t('Longest streak of correct advancing picks', 'Mayor racha de aciertos de avance seguidos'), win: winner(skillQ, (r) => r.streak, 'max', true), fmt: (r: Rec) => t(`${r.streak} in a row`, `${r.streak} seguidos`) },
      { icon: '💀', title: t('Cursed', 'Maldito'), desc: t('Most blank (zero-point) matches', 'Más partidos en blanco (cero puntos)'), win: winner(skillQ, (r) => r.zero, 'max', true), fmt: (r: Rec) => t(`${r.zero} blanks`, `${r.zero} en blanco`) },
      { icon: '🪨', title: t('The Rock', 'La Roca'), desc: t('Banks points in the highest share of matches', 'Suma puntos en la mayor proporción de partidos'), win: winner(skillQ, (r) => r.reliable, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.reliable ?? 0) * 100)}% on the board`, `${Math.round((r.reliable ?? 0) * 100)}% con puntos`) },
      { icon: '📈', title: t('Optimist', 'Optimista'), desc: t('Most goals predicted per game', 'Más goles pronosticados por partido'), win: winner(crowdQ, (r) => r.goalsAvg, 'max', false), fmt: (r: Rec) => t(`${(r.goalsAvg ?? 0).toFixed(1)} g/game`, `${(r.goalsAvg ?? 0).toFixed(1)} g/partido`) },
      { icon: '🧱', title: t('The Wall', 'El Muro'), desc: t('Fewest goals predicted per game', 'Menos goles pronosticados por partido'), win: winner(crowdQ, (r) => r.goalsAvg, 'min', false), fmt: (r: Rec) => t(`${(r.goalsAvg ?? 0).toFixed(1)} g/game`, `${(r.goalsAvg ?? 0).toFixed(1)} g/partido`) },
      { icon: '🃏', title: t('Chaos Agent', 'Agente del Caos'), desc: t('Highest share of picks calling penalties', 'Mayor proporción de pronósticos con penales'), win: winner(crowdQ, (r) => r.pensShare, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.pensShare ?? 0) * 100)}% pens`, `${Math.round((r.pensShare ?? 0) * 100)}% penales`) },
      { icon: '🐑', title: t('The Sheep', 'La Oveja'), desc: t("Most often with the pool's pick", 'Más veces con la elección del grupo'), win: winner(crowdQ, (r) => r.sheep, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.sheep ?? 0) * 100)}% consensus`, `${Math.round((r.sheep ?? 0) * 100)}% consenso`) },
      { icon: '🤠', title: t('Maverick', 'Rebelde'), desc: t('Most often against the consensus', 'Más veces contra el consenso'), win: winner(crowdQ, (r) => r.maverick, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.maverick ?? 0) * 100)}% contrarian`, `${Math.round((r.maverick ?? 0) * 100)}% contrario`) },
      { icon: '🐺', title: t('Lone Wolf', 'Lobo Solitario'), desc: t('Most scorelines no one else picked', 'Más marcadores que nadie más eligió'), win: winner(crowdQ, (r) => r.unique, 'max', true), fmt: (r: Rec) => t(`${r.unique} unique`, `${r.unique} únicos`) },
    ].map((a) => ({ ...a, res: a.win }))
  }, [picks, stats, matches, t])

  // Per-player points grouped by round, mirroring the DB's prediction_scores
  // formula (per-category points × round multiplier) so numbers match the totals.
  const pointsByRound = useMemo(() => {
    const out = new Map<string, Map<string, number>>()
    if (!config) return out
    const multByRound = new Map(rounds.map((r) => [r.code, r.multiplier]))
    const matchById = new Map(matches.map((m) => [m.id, m]))
    for (const p of picks) {
      const m = matchById.get(p.match_id)
      if (!m || m.home_score == null || m.away_score == null) continue
      const mult = multByRound.get(m.round) ?? 1
      let pts = 0
      if (m.advancing_team && p.advancing_team === m.advancing_team) pts += config.points_advance * mult
      if (p.home_score === m.home_score && p.away_score === m.away_score) pts += config.points_exact * mult
      if (Math.sign(p.home_score - p.away_score) === Math.sign(m.home_score - m.away_score))
        pts += config.points_tendency * mult
      if (m.went_to_penalties != null && p.penalties === m.went_to_penalties)
        pts += config.points_penalties * mult
      if (pts === 0) continue
      let um = out.get(p.user_id)
      if (!um) {
        um = new Map()
        out.set(p.user_id, um)
      }
      um.set(m.round, (um.get(m.round) ?? 0) + pts)
    }
    return out
  }, [picks, matches, config, rounds])

  // How often the pool's majority advancing pick actually went through.
  const crowd = useMemo(() => {
    const adv = new Map<string, Map<string, number>>()
    for (const p of picks) {
      const am = adv.get(p.match_id) ?? new Map<string, number>()
      am.set(p.advancing_team, (am.get(p.advancing_team) ?? 0) + 1)
      adv.set(p.match_id, am)
    }
    let total = 0
    let correct = 0
    for (const m of matches) {
      if (m.home_score == null || !m.advancing_team) continue
      const am = adv.get(m.id)
      if (!am || am.size === 0) continue
      let best = ''
      let n = -1
      for (const [team, c] of am) if (c > n) ((best = team), (n = c))
      total += 1
      if (best === m.advancing_team) correct += 1
    }
    return { total, pct: total ? Math.round((correct / total) * 100) : 0 }
  }, [picks, matches])

  // The single most-predicted scoreline across everyone.
  const favScore = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of picks) {
      const k = `${p.home_score}-${p.away_score}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    let best = ''
    let n = 0
    for (const [k, c] of counts) if (c > n) ((best = k), (n = c))
    return {
      score: best.replace('-', '–'),
      pct: picks.length ? Math.round((n / picks.length) * 100) : 0,
      n,
    }
  }, [picks])

  // Rounds that have any points yet — drives the "by round" legend.
  const roundsWithPoints = ROUND_ORDER.filter((rc) =>
    [...pointsByRound.values()].some((um) => (um.get(rc) ?? 0) > 0),
  )

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Stats', 'Estadísticas')}</h1>
        <Spinner label={t('Crunching the numbers…', 'Procesando los números…')} />
      </div>
    )
  }

  const maxPts = Math.max(1, ...board.map((r) => r.total_points))
  const statByUser = new Map(stats.map((s) => [s.user_id, s]))
  // Pool-wide accuracy across every scored pick.
  const poolScored = board.reduce((a, r) => a + r.scored_predictions, 0)
  const poolExactPct = poolScored
    ? Math.round((board.reduce((a, r) => a + r.exact_scores, 0) / poolScored) * 100)
    : 0
  const poolAdvPct = poolScored
    ? Math.round((board.reduce((a, r) => a + r.correct_advances, 0) / poolScored) * 100)
    : 0
  const hasSupers = supers.some((a) => a.res)
  const hasResults = stats.some((s) => s.scored > 0)

  return (
    <div className="page">
      <h1>📊 {t('Stats', 'Estadísticas')}</h1>

      {board.length > 0 && (
        <div className="form-card">
          <div className="pdist-head">
            <div className="stat-title">{t('Points distribution', 'Distribución de puntos')}</div>
            {hasResults && (
              <div className="pdist-toggle">
                <button
                  type="button"
                  className={`pdist-chip ${mode === 'total' ? 'pdist-chip-on' : ''}`}
                  onClick={() => setMode('total')}
                >
                  {t('Total', 'Total')}
                </button>
                <button
                  type="button"
                  className={`pdist-chip ${mode === 'source' ? 'pdist-chip-on' : ''}`}
                  onClick={() => setMode('source')}
                >
                  {t('By source', 'Por origen')}
                </button>
                <button
                  type="button"
                  className={`pdist-chip ${mode === 'round' ? 'pdist-chip-on' : ''}`}
                  onClick={() => setMode('round')}
                >
                  {t('By round', 'Por ronda')}
                </button>
              </div>
            )}
          </div>
          {board.map((r) => {
            const st = statByUser.get(r.user_id)
            const um = pointsByRound.get(r.user_id)
            const segs =
              mode === 'source'
                ? CATS.map((c) => ({ color: c.color, v: st ? (st[c.key] as number) : 0, label: catLabel(c.label, t) }))
                : mode === 'round'
                  ? ROUND_ORDER.filter((rc) => (um?.get(rc) ?? 0) > 0).map((rc) => ({
                      color: ROUND_COLORS[rc],
                      v: um!.get(rc)!,
                      label: roundName(rc),
                    }))
                  : []
            const segSum = segs.reduce((a, s) => a + s.v, 0)
            const split = mode !== 'total'
            return (
              <div key={r.user_id} className="cbar-row">
                <span className="cbar-label">
                  {r.emoji || '🏳️'} {r.nickname}
                </span>
                <div className={`cbar-track ${split ? 'cbar-track-split' : ''}`}>
                  {split && segSum > 0 ? (
                    segs.map(
                      (s, i) =>
                        s.v > 0 && (
                          <div
                            key={i}
                            className="cat-seg"
                            style={{
                              width: `${(s.v / segSum) * (r.total_points / maxPts) * 100}%`,
                              background: s.color,
                            }}
                            title={`${s.label}: ${s.v}`}
                          />
                        ),
                    )
                  ) : (
                    <div
                      className="cbar-fill cbar-gold"
                      style={{ width: `${Math.round((r.total_points / maxPts) * 100)}%` }}
                    />
                  )}
                </div>
                <span className="cbar-pct">{r.total_points}</span>
              </div>
            )
          })}
          {mode !== 'total' && (
            <div className="cat-legend">
              {(mode === 'source'
                ? CATS.map((c) => ({ color: c.color, label: catLabel(c.label, t) }))
                : roundsWithPoints.map((rc) => ({ color: ROUND_COLORS[rc], label: roundName(rc) }))
              ).map((it, i) => (
                <span key={i} className="cat-key">
                  <span className="cat-dot" style={{ background: it.color }} /> {it.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Superlatives ---------------- */}
      <h2 className="stat-h mt-lg">🏅 {t('Superlatives', 'Superlativos')}</h2>
      {!hasSupers ? (
        <p className="muted small">{t('Titles are awarded once there are enough picks & results.', 'Los títulos se otorgan cuando hay suficientes pronósticos y resultados.')}</p>
      ) : (
        <>
          <div className="super-grid">
            {(showAllSupers ? supers : supers.slice(0, 4)).map((a) => (
              <div key={a.title} className={`super ${a.res ? '' : 'super-pending'}`}>
                <span className="super-icon">{a.icon}</span>
                <div className="super-main">
                  <div className="super-title">{a.title}</div>
                  <div className="super-crit">{a.desc}</div>
                </div>
                <div className="super-right">
                  {a.res ? (
                    <>
                      <div className="super-winner">
                        {a.res.map((w) => w.emoji).join(' ')}{' '}
                        {a.res.length === 1 ? a.res[0].nick : t('Tied', 'Empate')}
                      </div>
                      <div className="super-val">{a.fmt(a.res[0])}</div>
                    </>
                  ) : (
                    <div className="super-pending-txt">
                      {t('Needs more results', 'Faltan más resultados')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {supers.length > 4 && (
            <div className="super-toggle-wrap">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAllSupers((v) => !v)}
              >
                {showAllSupers
                  ? t('Show fewer', 'Ver menos')
                  : t(`Show all ${supers.length}`, `Ver los ${supers.length}`)}
              </button>
            </div>
          )}
        </>
      )}

      {/* ---------------- By the numbers ---------------- */}
      {goals.playedCount > 0 && (
        <>
          <h2 className="stat-h stat-h-divider">{t('By the numbers', 'En números')}</h2>
          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="stat-big">{goals.predicted.toFixed(1)}</div>
              <div className="stat-cap">{t('pool predicted goals/game', 'goles/partido pronosticados por el grupo')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-big">{poolExactPct}%</div>
              <div className="stat-cap">{t('of picks were exact scores', 'de los pronósticos fueron exactos')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-big">{crowd.pct}%</div>
              <div className="stat-cap">{t('the crowd favourite advanced', 'el favorito del grupo avanzó')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-big">{goals.actual.toFixed(1)}</div>
              <div className="stat-cap">{t('actual goals/game', 'goles/partido reales')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-big">{poolAdvPct}%</div>
              <div className="stat-cap">{t('called the right team through', 'acertaron quién avanza')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-big">{favScore.score || '—'}</div>
              <div className="stat-cap">
                {t(`most-picked scoreline · ${favScore.pct}%`, `marcador más elegido · ${favScore.pct}%`)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
