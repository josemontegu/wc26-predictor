import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  LeaderboardRow,
  LockedAwardPrediction,
  LockedPrediction,
  Match,
  PlayerStat,
} from '../lib/types'
import { teamFlag } from '../lib/teamMeta'
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

const CATS = [
  { key: 'pts_advance', label: 'Advance', color: '#07a06a' },
  { key: 'pts_exact', label: 'Exact', color: '#2b4ea8' },
  { key: 'pts_tendency', label: 'Result', color: '#0bbd7e' },
  { key: 'pts_awards', label: 'Awards', color: '#f5b301' },
] as const

function topPick(list: LockedAwardPrediction[]) {
  const counts = new Map<string, number>()
  for (const p of list) counts.set(p.pick, (counts.get(p.pick) ?? 0) + 1)
  let best = ''
  let n = 0
  for (const [k, v] of counts) if (v > n) ((best = k), (n = v))
  return { pick: best, n, total: list.length }
}

export default function StatsPage() {
  const t = useT()
  const [board, setBoard] = useState<LeaderboardRow[]>([])
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [picks, setPicks] = useState<LockedPrediction[]>([])
  const [awardPicks, setAwardPicks] = useState<LockedAwardPrediction[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('leaderboard').select('*'),
      supabase.from('player_stats').select('*'),
      supabase.from('locked_predictions').select('*'),
      supabase.from('locked_award_predictions').select('*'),
      supabase.from('matches').select('*'),
    ]).then(([b, s, p, a, m]) => {
      if (!active) return
      // Exclude players who haven't set a nickname yet (incomplete sign-ups).
      const named = (n: string | null | undefined) => (n ?? '').trim() !== ''
      setBoard(((b.data as LeaderboardRow[]) ?? []).filter((r) => named(r.nickname)))
      setStats(((s.data as PlayerStat[]) ?? []).filter((r) => named(r.nickname)))
      setPicks((p.data as LockedPrediction[]) ?? [])
      setAwardPicks((a.data as LockedAwardPrediction[]) ?? [])
      setMatches((m.data as Match[]) ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const pulse = useMemo(() => {
    const champ = awardPicks.filter((a) => a.award_key === 'champion')
    const champCounts = new Map<string, number>()
    for (const c of champ) champCounts.set(c.pick, (champCounts.get(c.pick) ?? 0) + 1)
    const champBars = [...champCounts.entries()]
      .map(([team, n]) => ({ team, n, pct: champ.length ? Math.round((n / champ.length) * 100) : 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)

    const pensTotal = picks.length
    const pensYes = picks.filter((p) => p.penalties).length
    const avgGoals = picks.length
      ? picks.reduce((s, p) => s + p.home_score + p.away_score, 0) / picks.length
      : 0

    return {
      champBars,
      champTotal: champ.length,
      ball: topPick(awardPicks.filter((a) => a.award_key === 'golden_ball')),
      boot: topPick(awardPicks.filter((a) => a.award_key === 'golden_boot')),
      glove: topPick(awardPicks.filter((a) => a.award_key === 'golden_glove')),
      pensPct: pensTotal ? Math.round((pensYes / pensTotal) * 100) : 0,
      avgGoals,
    }
  }, [awardPicks, picks])

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

    const recs = stats.map((s) => {
      const ps = byUser.get(s.user_id) ?? []
      const n = ps.length
      let withCrowd = 0
      let unique = 0
      for (const p of ps) {
        if (plurality.get(p.match_id) === p.advancing_team) withCrowd++
        if (scoreCounts.get(p.match_id)?.get(`${p.home_score}-${p.away_score}`) === 1) unique++
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
      { icon: '💀', title: t('Cursed', 'Maldito'), desc: t('Most blank (zero-point) matches', 'Más partidos en blanco (cero puntos)'), win: winner(skillQ, (r) => r.zero, 'max', true), fmt: (r: Rec) => t(`${r.zero} blanks`, `${r.zero} en blanco`) },
      { icon: '📈', title: t('Optimist', 'Optimista'), desc: t('Most goals predicted per game', 'Más goles pronosticados por partido'), win: winner(crowdQ, (r) => r.goalsAvg, 'max', false), fmt: (r: Rec) => t(`${(r.goalsAvg ?? 0).toFixed(1)} g/game`, `${(r.goalsAvg ?? 0).toFixed(1)} g/partido`) },
      { icon: '🧱', title: t('The Wall', 'El Muro'), desc: t('Fewest goals predicted per game', 'Menos goles pronosticados por partido'), win: winner(crowdQ, (r) => r.goalsAvg, 'min', false), fmt: (r: Rec) => t(`${(r.goalsAvg ?? 0).toFixed(1)} g/game`, `${(r.goalsAvg ?? 0).toFixed(1)} g/partido`) },
      { icon: '🃏', title: t('Chaos Agent', 'Agente del Caos'), desc: t('Highest share of picks calling penalties', 'Mayor proporción de pronósticos con penales'), win: winner(crowdQ, (r) => r.pensShare, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.pensShare ?? 0) * 100)}% pens`, `${Math.round((r.pensShare ?? 0) * 100)}% penales`) },
      { icon: '🐑', title: t('The Sheep', 'La Oveja'), desc: t("Most often with the pool's pick", 'Más veces con la elección del grupo'), win: winner(crowdQ, (r) => r.sheep, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.sheep ?? 0) * 100)}% consensus`, `${Math.round((r.sheep ?? 0) * 100)}% consenso`) },
      { icon: '🤠', title: t('Maverick', 'Rebelde'), desc: t('Most often against the consensus', 'Más veces contra el consenso'), win: winner(crowdQ, (r) => r.maverick, 'max', true), fmt: (r: Rec) => t(`${Math.round((r.maverick ?? 0) * 100)}% contrarian`, `${Math.round((r.maverick ?? 0) * 100)}% contrario`) },
      { icon: '🐺', title: t('Lone Wolf', 'Lobo Solitario'), desc: t('Most scorelines no one else picked', 'Más marcadores que nadie más eligió'), win: winner(crowdQ, (r) => r.unique, 'max', true), fmt: (r: Rec) => t(`${r.unique} unique`, `${r.unique} únicos`) },
    ].map((a) => ({ ...a, res: a.win }))
  }, [picks, stats, matches, t])

  if (loading) {
    return (
      <div className="page">
        <h1>{t('Stats', 'Estadísticas')}</h1>
        <Spinner label={t('Crunching the numbers…', 'Procesando los números…')} />
      </div>
    )
  }

  const maxPts = Math.max(1, ...board.map((r) => r.total_points))
  const hasSupers = supers.some((a) => a.res)
  const hasPulse = pulse.champTotal > 0 || picks.length > 0
  const hasResults = stats.some((s) => s.scored > 0)

  return (
    <div className="page">
      <h1>📊 {t('Stats', 'Estadísticas')}</h1>

      {/* ---------------- Pool Pulse ---------------- */}
      <h2 className="stat-h">🔮 {t('Pool Pulse', 'Pulso del grupo')}</h2>
      {!hasPulse ? (
        <p className="muted small">
          {t(
            'Pool stats appear as matches lock and award picks close — nothing revealed yet.',
            'Las estadísticas del grupo aparecen cuando los partidos se bloquean y cierran los pronósticos de premios — aún no hay nada revelado.',
          )}
        </p>
      ) : (
        <>
          {pulse.champBars.length > 0 && (
            <div className="form-card">
              <div className="stat-title">{t('Who the pool backs to win it', 'A quién apuesta el grupo para ganar')}</div>
              {pulse.champBars.map((b) => (
                <div key={b.team} className="cbar-row">
                  <span className="cbar-label">
                    {teamFlag(b.team)} {b.team}
                  </span>
                  <div className="cbar-track">
                    <div className="cbar-fill" style={{ width: `${b.pct}%` }} />
                  </div>
                  <span className="cbar-pct">{b.pct}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="stat-tiles">
            <AwardTile icon="⚽" label={t('Golden Ball', 'Balón de Oro')} pick={pulse.ball} t={t} />
            <AwardTile icon="👟" label={t('Golden Boot', 'Bota de Oro')} pick={pulse.boot} t={t} />
            <AwardTile icon="🧤" label={t('Golden Glove', 'Guante de Oro')} pick={pulse.glove} t={t} />
          </div>

          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="stat-big">{pulse.pensPct}%</div>
              <div className="stat-cap">🥅 {t('of picks call penalties', 'de los pronósticos predicen penales')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-big">{pulse.avgGoals.toFixed(1)}</div>
              <div className="stat-cap">⚽ {t('goals/game the pool expects', 'goles/partido que espera el grupo')}</div>
            </div>
          </div>
        </>
      )}

      {/* ---------------- Superlatives ---------------- */}
      <h2 className="stat-h mt-lg">🏅 {t('Superlatives', 'Superlativos')}</h2>
      {!hasSupers ? (
        <p className="muted small">{t('Titles are awarded once there are enough picks & results.', 'Los títulos se otorgan cuando hay suficientes pronósticos y resultados.')}</p>
      ) : (
        <div className="super-grid">
          {supers.map((a) => (
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
                  <div className="super-pending-txt">{t('Not yet', 'Aún no')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- Per-player breakdown ---------------- */}
      <h2 className="stat-h mt-lg">📈 {t('By player', 'Por jugador')}</h2>
      {!hasResults ? (
        <p className="muted small">{t('Player stats appear once results are in.', 'Las estadísticas de jugadores aparecen cuando hay resultados.')}</p>
      ) : (
        <div className="pstat-list">
          {[...stats]
            .sort(
              (a, b) =>
                b.pts_advance +
                b.pts_exact +
                b.pts_tendency +
                b.pts_penalties +
                b.pts_exact_aet +
                b.pts_awards -
                (a.pts_advance +
                  a.pts_exact +
                  a.pts_tendency +
                  a.pts_penalties +
                  a.pts_exact_aet +
                  a.pts_awards),
            )
            .map((s) => {
              const total =
                s.pts_advance + s.pts_exact + s.pts_tendency + s.pts_penalties + s.pts_exact_aet + s.pts_awards
              const acc = s.scored ? Math.round((s.correct_advances / s.scored) * 100) : 0
              return (
                <div key={s.user_id} className="pstat">
                  <div className="pstat-head">
                    <span className="pstat-emoji">{s.emoji || '🏳️'}</span>
                    <span className="pstat-nick">{s.nickname}</span>
                    <span className="pstat-meta">
                      {t(`${acc}% advance`, `${acc}% avance`)} · {t(`${s.exact_scores} exact`, `${s.exact_scores} exactos`)}
                    </span>
                  </div>
                  <div className="cat-bar">
                    {CATS.map((c) => {
                      const v = s[c.key] as number
                      if (!v || !total) return null
                      return (
                        <div
                          key={c.key}
                          className="cat-seg"
                          style={{ width: `${(v / total) * 100}%`, background: c.color }}
                          title={`${catLabel(c.label, t)}: ${v}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          <div className="cat-legend">
            {CATS.map((c) => (
              <span key={c.key} className="cat-key">
                <span className="cat-dot" style={{ background: c.color }} /> {catLabel(c.label, t)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Charts & figures ---------------- */}
      <h2 className="stat-h mt-lg">🎛️ {t('Figures', 'Gráficos')}</h2>
      {board.length === 0 ? (
        <p className="muted small">{t('No players yet.', 'Aún no hay jugadores.')}</p>
      ) : (
        <>
          <div className="form-card">
            <div className="stat-title">{t('Points distribution', 'Distribución de puntos')}</div>
            {board.map((r) => (
              <div key={r.user_id} className="cbar-row">
                <span className="cbar-label">
                  {r.emoji || '🏳️'} {r.nickname}
                </span>
                <div className="cbar-track">
                  <div
                    className="cbar-fill cbar-gold"
                    style={{ width: `${Math.round((r.total_points / maxPts) * 100)}%` }}
                  />
                </div>
                <span className="cbar-pct">{r.total_points}</span>
              </div>
            ))}
          </div>

          {goals.playedCount > 0 && (
            <div className="stat-tiles">
              <div className="stat-tile">
                <div className="stat-big">{goals.predicted.toFixed(1)}</div>
                <div className="stat-cap">🔮 {t('pool predicted goals/game', 'goles/partido pronosticados por el grupo')}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-big">{goals.actual.toFixed(1)}</div>
                <div className="stat-cap">✅ {t('actual goals/game', 'goles/partido reales')}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AwardTile({
  icon,
  label,
  pick,
  t,
}: {
  icon: string
  label: string
  pick: { pick: string; n: number; total: number }
  t: TFn
}) {
  const pct = pick.total ? Math.round((pick.n / pick.total) * 100) : 0
  return (
    <div className="stat-tile">
      <div className="award-tile-label">
        {icon} {label}
      </div>
      <div className="award-tile-pick">{pick.pick || '—'}</div>
      {pick.pick && <div className="stat-cap">{t(`${pct}% of the pool`, `${pct}% del grupo`)}</div>}
    </div>
  )
}
