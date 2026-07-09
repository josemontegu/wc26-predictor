import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Eye, Goal, Lock, Medal, Timer } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type {
  AppConfig,
  Bullet,
  BulletValidity,
  LockedBulletPick,
  LockedPrediction,
  Match,
  MyScore,
  Prediction,
  Round,
} from '../lib/types'
import { isLocked, hasResult, resolveOutcome } from '../lib/types'
import { roundName, formatKickoff } from '../lib/format'
import { teamFlag, teamColors, teamName, avatarGradient } from '../lib/teamMeta'
import { fireConfetti } from '../lib/confetti'
import { scorePrediction } from '../lib/scoring'
import { useT, type TFn } from '../lib/i18n'
import Spinner from '../components/Spinner'
import Scoreline from '../components/Scoreline'
import BulletCard from '../components/BulletCard'

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(99, n))
}

// Countdown to lock: coarse when far off ("2d 4h"), down to the second in the
// final hour ("5m 23s", "42s"). The last minute is when it matters, since
// picks lock a minute before kickoff.
function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  const [match, setMatch] = useState<Match | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [score, setScore] = useState<MyScore | null>(null)
  const [picks, setPicks] = useState<LockedPrediction[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [roundMult, setRoundMult] = useState(1)
  const [shadowIds, setShadowIds] = useState<Set<string>>(new Set())
  const [bulletBonus, setBulletBonus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const confettiFired = useRef(false)

  // form state. Scores start blank ('') so they must be actively chosen,
  // rather than defaulting to a 0–0 nobody picked.
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [advancing, setAdvancing] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!id) return
      setLoading(true)
      const [matchRes, predRes, scoreRes, picksRes, profRes, cfgRes, roundRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('predictions')
          .select('*')
          .eq('match_id', id)
          .eq('user_id', session!.user.id)
          .maybeSingle(),
        supabase.from('my_scores').select('*').eq('match_id', id).maybeSingle(),
        supabase.from('locked_predictions').select('*').eq('match_id', id),
        supabase.from('profiles').select('id, official'),
        supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('rounds').select('code, multiplier'),
      ])
      if (!active) return
      if (matchRes.error) setError(matchRes.error.message)
      const m = matchRes.data as Match | null
      setMatch(m)
      const p = predRes.data as Prediction | null
      setPrediction(p)
      setScore((scoreRes.data as MyScore) ?? null)
      setPicks((picksRes.data as LockedPrediction[]) ?? [])
      setConfig((cfgRes.data as AppConfig) ?? null)
      const mult = ((roundRes.data as Round[]) ?? []).find((r) => r.code === m?.round)?.multiplier
      setRoundMult(mult ?? 1)
      setShadowIds(
        new Set(
          ((profRes.data as { id: string; official: boolean }[]) ?? [])
            .filter((pr) => pr.official === false)
            .map((pr) => pr.id),
        ),
      )

      // Bullet bonus per player on this match. Same "resolved + everyone in"
      // rule as the leaderboard, so the picks list total matches what they
      // actually got credited.
      const { data: bulletRows } = await supabase.from('bullets').select('*').eq('match_id', id)
      const bulletList = (bulletRows as Bullet[]) ?? []
      if (bulletList.length) {
        const ids = bulletList.map((b) => b.id)
        const [valRes, revRes] = await Promise.all([
          supabase.from('bullet_validity').select('*').in('bullet_id', ids),
          supabase.from('locked_bullet_picks').select('*').in('bullet_id', ids),
        ])
        const valMap: Record<string, BulletValidity> = {}
        for (const v of (valRes.data as BulletValidity[]) ?? []) valMap[v.bullet_id] = v
        const bonus: Record<string, number> = {}
        for (const r of (revRes.data as LockedBulletPick[]) ?? []) {
          const b = bulletList.find((x) => x.id === r.bullet_id)
          const v = valMap[r.bullet_id]
          if (b && b.answer !== null && v?.everyone_in && r.choice === b.answer) {
            bonus[r.user_id] = (bonus[r.user_id] ?? 0) + b.points
          }
        }
        if (active) setBulletBonus(bonus)
      } else if (active) {
        setBulletBonus({})
      }

      if (p) {
        setHome(String(p.home_score))
        setAway(String(p.away_score))
        setAdvancing(p.advancing_team)
      } else {
        // No prediction yet. Blank slate (don't carry over the last match).
        setHome('')
        setAway('')
        setAdvancing('')
      }
      setLoading(false)

      // Confetti for a perfect call once the result is in. With a single final
      // score, an exact score + correct team advancing is a perfect prediction
      // (penalties are derived from the score, so they always agree).
      if (m && p && hasResult(m) && !confettiFired.current) {
        const perfect =
          p.home_score === m.home_score &&
          p.away_score === m.away_score &&
          m.advancing_team === p.advancing_team
        if (perfect) {
          confettiFired.current = true
          setTimeout(() => fireConfetti(), 300)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [id, session])

  const played = useMemo(() => (match ? hasResult(match) : false), [match])
  // Tick every second so the countdown stays live and the form flips to
  // "locked" the instant it closes, even if the viewer never reloads.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!match || played) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [match, played])
  const lockAt = match?.lock_time ? new Date(match.lock_time).getTime() : null
  const locked = lockAt == null || now >= lockAt
  const msToLock = lockAt != null ? lockAt - now : 0

  // Keep the prediction internally consistent with the laws of knockout football:
  // a decisive final score locks in the winner; a level score is a shootout and
  // leaves "who advances" a free pick.
  useEffect(() => {
    if (!match || isLocked(match)) return
    if (match.home_team === 'TBD' || match.away_team === 'TBD') return
    if (home === '' || away === '') return // wait until both scores are chosen
    const h = Number(home)
    const a = Number(away)
    if (h !== a) {
      const w = h > a ? match.home_team : match.away_team
      if (advancing !== w) setAdvancing(w)
    }
  }, [match, home, away, advancing])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!match || !session?.user) return
    setBusy(true)
    setError(null)
    setSaved(false)

    const h = Number(home)
    const a = Number(away)
    const result = resolveOutcome(h, a)
    const adv = result.winnerSide
      ? result.winnerSide === 'home'
        ? match.home_team
        : match.away_team
      : advancing
    if (!adv) {
      setBusy(false)
      setError(t('Pick which team wins the shootout.', 'Elige qué equipo gana la tanda de penales.'))
      return
    }

    const payload = {
      user_id: session.user.id,
      match_id: match.id,
      home_score: h,
      away_score: a,
      aet_home_score: null,
      aet_away_score: null,
      advancing_team: adv,
      penalties: result.penalties,
    }

    const { data, error } = await supabase
      .from('predictions')
      .upsert(payload, { onConflict: 'user_id,match_id' })
      .select()
      .single()

    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setPrediction(data as Prediction)
    setSaved(true)
  }

  if (loading) {
    return (
      <div className="page">
        <Spinner label={t('Loading match…', 'Cargando partido…')} />
      </div>
    )
  }

  if (!match) {
    return (
      <div className="page">
        <p className="notice notice-err">{t('Match not found.', 'Partido no encontrado.')}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          ← {t('Back to matches', 'Volver a los partidos')}
        </button>
      </div>
    )
  }

  const teamsKnown = match.home_team !== 'TBD' && match.away_team !== 'TBD'
  const canEdit = !locked && teamsKnown

  // Points a pick earned on this (finished) match: shared scoring module,
  // × the round multiplier, plus any bullet bonus they banked on this match.
  const pointsFor = (p: LockedPrediction): number =>
    (played && config ? scorePrediction(p, match, config, roundMult).points : 0) +
    (bulletBonus[p.user_id] ?? 0)
  const homeN = home === '' ? null : Number(home)
  const awayN = away === '' ? null : Number(away)
  const bothSet = homeN !== null && awayN !== null
  const outcome = resolveOutcome(homeN ?? 0, awayN ?? 0)
  const lockedWinner = outcome.winnerSide
    ? outcome.winnerSide === 'home'
      ? match.home_team
      : match.away_team
    : null
  const isShootout = outcome.phase === 'shootout'
  // A level score still needs the user to name a shootout winner before it's a
  // complete, submittable prediction.
  const needsWinner = canEdit && bothSet && isShootout && !advancing
  // Progressive disclosure: reveal the outcome only once both scores are chosen.
  const showResolution = bothSet
  // A blank side increments to 0; 0 decrements back to blank.
  const bumpHome = (d: number) =>
    setHome(homeN === null ? (d > 0 ? '0' : '') : homeN + d < 0 ? '' : String(clampScore(homeN + d)))
  const bumpAway = (d: number) =>
    setAway(awayN === null ? (d > 0 ? '0' : '') : awayN + d < 0 ? '' : String(clampScore(awayN + d)))

  // Each side's own two-kit-colour band, meeting in the middle. Same
  // treatment as the match cards, scaled up to a header.
  const [homeC1, homeC2] = teamColors(match.home_team)
  const [awayC1, awayC2] = teamColors(match.away_team)

  return (
    <div className="page">
      <button className="btn btn-ghost back-btn" onClick={() => navigate(-1)}>
        ← {t('Back', 'Atrás')}
      </button>

      <div
        className="detail-top"
        style={{
          background: `linear-gradient(135deg, ${homeC2} 0%, ${homeC1} 38%, ${awayC1} 62%, ${awayC2} 100%)`,
        }}
      >
        <span className="detail-scrim" />
        <span className="detail-round">
          {roundName(match.round)}
          {match.match_no ? ` · ${t('Match', 'Partido')} ${match.match_no}` : ''}
        </span>
        {match.kickoff_time && (
          <div className="detail-when">{formatKickoff(match.kickoff_time)}</div>
        )}
        <div className="detail-fixture">
          <div className="df-team">
            <span className="df-flag">{teamFlag(match.home_team)}</span>
            <span className="df-name">{teamName(match.home_team)}</span>
          </div>
          {played ? (
            <Scoreline match={match} className="df-score" />
          ) : (
            <span className="df-vs">VS</span>
          )}
          <div className="df-team">
            <span className="df-flag">{teamFlag(match.away_team)}</span>
            <span className="df-name">{teamName(match.away_team)}</span>
          </div>
        </div>
        {/* Only spell out who advanced when it isn't implicit: a level result
            decided on penalties. A decisive score speaks for itself. */}
        {played && match.went_to_penalties && match.advancing_team && (
          <div className="detail-meta">
            <span><CheckCircle2 className="ic" aria-hidden="true" /> {t('Advanced on penalties', 'Avanzó por penales')}: {teamName(match.advancing_team)}</span>
          </div>
        )}
        {played && score && (
          <div className="detail-pts">
            <Medal className="ic" aria-hidden="true" />{' '}
            {t(`You scored ${score.total_points} pts on this match`, `Sumaste ${score.total_points} pts en este partido`)}
          </div>
        )}
      </div>

      {!teamsKnown && (
        <div className="notice notice-info">
          {t(
            "Teams aren't confirmed yet. You can predict once the matchup is set.",
            'Los equipos aún no están confirmados. Podrás pronosticar cuando se defina el cruce.',
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="form-card">
        <h2 className="form-card-head">
          {prediction ? t('Your prediction', 'Tu pronóstico') : t('Make your prediction', 'Haz tu pronóstico')}
          {locked && (
            <span className="status status-locked">
              <Lock className="ic" aria-hidden="true" /> {t('Locked', 'Cerrado')}
            </span>
          )}
        </h2>

        {canEdit && lockAt != null && (
          <div
            className={`lock-countdown ${
              msToLock < 60_000
                ? 'lock-countdown-crit'
                : msToLock < 15 * 60_000
                  ? 'lock-countdown-warn'
                  : ''
            }`}
          >
            <Timer className="lock-countdown-ico" aria-hidden="true" />
            {t('Closes in', 'Cierra en')} <strong>{formatCountdown(msToLock)}</strong>
            <span className="lock-countdown-sub">
              {' · '}
              {prediction
                ? t('you can still change it', 'aún puedes cambiarlo')
                : t('get your pick in', 'haz tu pronóstico')}
            </span>
          </div>
        )}

        <label className="field-label">
          {t('Final score', 'Marcador final')} <span className="muted small">{t('· after extra time, before penalties', '· tras el tiempo extra, antes de los penales')}</span>
        </label>
        <div className="stepper-row">
          <ScoreStepper
            t={t}
            flag={teamFlag(match.home_team)}
            team={match.home_team}
            value={homeN}
            disabled={!canEdit}
            atMin={homeN === null}
            onDec={() => bumpHome(-1)}
            onInc={() => bumpHome(1)}
          />
          <span className="stepper-dash">–</span>
          <ScoreStepper
            t={t}
            flag={teamFlag(match.away_team)}
            team={match.away_team}
            value={awayN}
            disabled={!canEdit}
            atMin={awayN === null}
            onDec={() => bumpAway(-1)}
            onInc={() => bumpAway(1)}
          />
        </div>

        {canEdit && !bothSet && (
          <p className="muted small hint">
            {t(
              'Tap + to set the final score (after extra time, if any) and make your prediction.',
              'Toca + para ingresar el marcador final (incluido el tiempo extra, si lo hay) y hacer tu pronóstico.',
            )}
          </p>
        )}

        {showResolution && (
          <>
            <label className="field-label">{t('Who advances?', '¿Quién avanza?')}</label>
            <div className={`choice-row ${needsWinner ? 'choice-row-needed' : ''}`}>
              {[match.home_team, match.away_team].map((team) => (
                <button
                  type="button"
                  key={team}
                  disabled={!canEdit || !isShootout}
                  className={`choice ${advancing === team ? 'choice-active' : ''}`}
                  onClick={() => setAdvancing(team)}
                >
                  <span>{teamFlag(team)}</span>
                  {teamName(team)}
                </button>
              ))}
            </div>
            {canEdit && needsWinner && (
              <p className="small hint hint-needed">
                {t(
                  'One more step: pick who wins the shootout to submit.',
                  'Un paso más: elige quién gana la tanda para enviar.',
                )}
              </p>
            )}
            {canEdit && !needsWinner && (
              <p className="muted small hint">
                {outcome.phase === 'reg' && t(`${teamName(lockedWinner)} win and advance.`, `${teamName(lockedWinner)} gana y avanza.`)}
                {isShootout && t(`${teamName(advancing)} win the shootout and advance.`, `${teamName(advancing)} gana la tanda y avanza.`)}
              </p>
            )}

            <div className={`outcome-chip outcome-${outcome.phase}`}>
              {outcome.phase === 'reg' && (
                <><CheckCircle2 className="ic" aria-hidden="true" /> {t('Decided in normal or extra time: no penalties', 'Se define en el tiempo reglamentario o extra: sin penales')}</>
              )}
              {outcome.phase === 'shootout' && (
                <><Goal className="ic" aria-hidden="true" /> {t('Goes to a penalty shootout', 'Se va a tanda de penales')}</>
              )}
            </div>
          </>
        )}

        {error && <div className="notice notice-err">{error}</div>}
        {saved && <div className="notice notice-ok">{t('Prediction saved ✓', 'Pronóstico guardado ✓')}</div>}

        {canEdit ? (
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !bothSet || (isShootout && !advancing)}
          >
            {busy ? t('Saving…', 'Guardando…') : prediction ? t('Update prediction', 'Actualizar pronóstico') : t('Submit prediction', 'Enviar pronóstico')}
          </button>
        ) : (
          !locked && (
            <div className="notice notice-info">
              {t('Predictions open once the teams are confirmed.', 'Los pronósticos se abren cuando se confirmen los equipos.')}
            </div>
          )
        )}
      </form>

      <BulletCard match={match} />

      {locked && picks.length > 0 && (
        <div className="form-card">
          <div className="rule-card-head">
            <Eye className="rule-icon" size={20} aria-hidden="true" />
            <h2>{t("Everyone's picks", 'Pronósticos de todos')} ({picks.length})</h2>
          </div>
          <div className="picks-list">
            {picks
              .slice()
              .sort((a, b) => a.nickname.localeCompare(b.nickname))
              .map((p) => {
                const isMe = p.user_id === session?.user.id
                const exactRight =
                  played && p.home_score === match.home_score && p.away_score === match.away_score
                const advRight =
                  match.advancing_team != null && p.advancing_team === match.advancing_team
                return (
                  <div
                    key={p.user_id}
                    className={`pick-row ${isMe ? 'pick-row-me' : ''} ${shadowIds.has(p.user_id) ? 'pick-row-shadow' : ''}`}
                  >
                    <span
                      className={`pick-avatar ${p.emoji ? 'avatar-emoji' : ''}`}
                      style={p.emoji ? undefined : { background: avatarGradient(p.user_id) }}
                    >
                      {p.emoji || (p.nickname || p.display_name || '?').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="pick-who">
                      {p.nickname || p.display_name}
                      {isMe && <span className="you-tag">{t('YOU', 'TÚ')}</span>}
                      {shadowIds.has(p.user_id) && (
                        <span className="shadow-badge shadow-badge-sm">{t('Guest', 'Invitado')}</span>
                      )}
                    </span>
                    <span className={`pick-score ${exactRight ? 'pick-hit' : ''}`}>
                      {exactRight && <span className="pick-check">✓</span>}
                      {p.penalties && p.advancing_team === match.home_team && (
                        <sup className="pick-pen">p</sup>
                      )}
                      {p.home_score}–{p.away_score}
                      {p.penalties && p.advancing_team === match.away_team && (
                        <sup className="pick-pen pick-pen-after">p</sup>
                      )}
                    </span>
                    <span className={`pick-adv ${advRight ? 'pick-hit' : ''}`}>
                      {teamFlag(p.advancing_team)}
                    </span>
                    {(played || bulletBonus[p.user_id] > 0) && (
                      <>
                        <span
                          className={`pick-pts ${pointsFor(p) === 0 ? 'pick-pts-zero' : ''}`}
                          aria-label={t(`${pointsFor(p)} points`, `${pointsFor(p)} puntos`)}
                        >
                          +{pointsFor(p)}
                        </span>
                        <span className="pick-bullet-col">
                          {bulletBonus[p.user_id] > 0 && (
                            <span className="pick-bullet" title={t('Bullet bonus included', 'Incluye bono de bullet')}>
                              ⚡
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreStepper({
  t,
  flag,
  team,
  value,
  disabled,
  atMin,
  onDec,
  onInc,
}: {
  t: TFn
  flag: string
  team: string
  value: number | null
  disabled: boolean
  atMin: boolean
  onDec: () => void
  onInc: () => void
}) {
  const empty = value === null
  return (
    <div className="stepper">
      <span className="stepper-flag">{flag}</span>
      <span className="stepper-team">{teamName(team)}</span>
      <div className="stepper-controls">
        <button
          type="button"
          className="step-btn"
          disabled={disabled || atMin}
          onClick={onDec}
          aria-label={t(`decrease ${team} score`, `disminuir el marcador de ${team}`)}
        >
          −
        </button>
        <span className="step-val">
          {empty ? (
            <span className="step-ghost" aria-label={t('not set, tap +', 'sin definir, toca +')}>
              0
            </span>
          ) : (
            value
          )}
        </span>
        <button
          type="button"
          // While empty, the + is the obvious starting point. Give it the accent
          // fill so a first-timer sees where to begin.
          className={`step-btn ${empty && !disabled ? 'step-btn-primed' : ''}`}
          disabled={disabled}
          onClick={onInc}
          aria-label={t(`increase ${team} score`, `aumentar el marcador de ${team}`)}
        >
          +
        </button>
      </div>
    </div>
  )
}
