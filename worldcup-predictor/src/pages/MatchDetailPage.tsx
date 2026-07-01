import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { LockedPrediction, Match, MyScore, Prediction } from '../lib/types'
import { isLocked, hasResult, resolveOutcome } from '../lib/types'
import { roundName, formatKickoff, formatLock } from '../lib/format'
import { teamFlag, teamColor, avatarGradient } from '../lib/teamMeta'
import { fireConfetti } from '../lib/confetti'
import { useT, type TFn } from '../lib/i18n'
import Spinner from '../components/Spinner'
import Scoreline from '../components/Scoreline'

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(99, n))
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
      const [matchRes, predRes, scoreRes, picksRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('predictions')
          .select('*')
          .eq('match_id', id)
          .eq('user_id', session!.user.id)
          .maybeSingle(),
        supabase.from('my_scores').select('*').eq('match_id', id).maybeSingle(),
        supabase.from('locked_predictions').select('*').eq('match_id', id),
      ])
      if (!active) return
      if (matchRes.error) setError(matchRes.error.message)
      const m = matchRes.data as Match | null
      setMatch(m)
      const p = predRes.data as Prediction | null
      setPrediction(p)
      setScore((scoreRes.data as MyScore) ?? null)
      setPicks((picksRes.data as LockedPrediction[]) ?? [])
      if (p) {
        setHome(String(p.home_score))
        setAway(String(p.away_score))
        setAdvancing(p.advancing_team)
      } else {
        // No prediction yet — blank slate (don't carry over the last match).
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

  const locked = useMemo(() => (match ? isLocked(match) : true), [match])
  const played = useMemo(() => (match ? hasResult(match) : false), [match])

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
  // Progressive disclosure: reveal the outcome only once both scores are chosen.
  const showResolution = bothSet
  // A blank side increments to 0; 0 decrements back to blank.
  const bumpHome = (d: number) =>
    setHome(homeN === null ? (d > 0 ? '0' : '') : homeN + d < 0 ? '' : String(clampScore(homeN + d)))
  const bumpAway = (d: number) =>
    setAway(awayN === null ? (d > 0 ? '0' : '') : awayN + d < 0 ? '' : String(clampScore(awayN + d)))

  return (
    <div className="page">
      <button className="btn btn-ghost back-btn" onClick={() => navigate(-1)}>
        ← {t('Back', 'Atrás')}
      </button>

      <div
        className="detail-top"
        style={{
          background: `linear-gradient(135deg, ${teamColor(match.home_team)}, ${teamColor(
            match.away_team,
          )})`,
        }}
      >
        <span className="detail-scrim" />
        <span className="detail-round">
          {roundName(match.round)}
          {match.match_no ? ` · ${t('Match', 'Partido')} ${match.match_no}` : ''}
        </span>
        <div className="detail-fixture">
          <div className="df-team">
            <span className="df-flag">{teamFlag(match.home_team)}</span>
            <span className="df-name">{match.home_team}</span>
          </div>
          {played ? (
            <Scoreline match={match} className="df-score" />
          ) : (
            <span className="df-vs">VS</span>
          )}
          <div className="df-team">
            <span className="df-flag">{teamFlag(match.away_team)}</span>
            <span className="df-name">{match.away_team}</span>
          </div>
        </div>
        <div className="detail-meta">
          <span>🕒 {t('Kick-off', 'Inicio')}: {formatKickoff(match.kickoff_time)}</span>
          <span>
            🔒 {locked ? t('Predictions closed', 'Los pronósticos cerrados') : t('Predictions close', 'Los pronósticos cierran')}: {formatLock(match.lock_time)}
          </span>
          {played && match.went_to_penalties !== null && (
            <span>🥅 {t('Penalties', 'Penales')}: {match.went_to_penalties ? t('Yes', 'Sí') : t('No', 'No')}</span>
          )}
          {played && match.advancing_team && <span>✅ {t('Advanced', 'Avanzó')}: {match.advancing_team}</span>}
        </div>
        {played && score && (
          <div className="detail-pts">
            {t(`🏅 You scored ${score.total_points} pts on this match`, `🏅 Sumaste ${score.total_points} pts en este partido`)}
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
        <h2>{prediction ? t('Your prediction', 'Tu pronóstico') : t('Make your prediction', 'Haz tu pronóstico')}</h2>

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
            <div className="choice-row">
              {[match.home_team, match.away_team].map((team) => (
                <button
                  type="button"
                  key={team}
                  disabled={!canEdit || !isShootout}
                  className={`choice ${advancing === team ? 'choice-active' : ''}`}
                  onClick={() => setAdvancing(team)}
                >
                  <span>{teamFlag(team)}</span>
                  {team}
                </button>
              ))}
            </div>
            {canEdit && (
              <p className="muted small hint">
                {outcome.phase === 'reg' && t(`${lockedWinner} win and advance.`, `${lockedWinner} gana y avanza.`)}
                {isShootout && t('Level after extra time — pick who wins the shootout.', 'Empate tras el tiempo extra: elige quién gana la tanda de penales.')}
              </p>
            )}

            <div className={`outcome-chip outcome-${outcome.phase}`}>
              {outcome.phase === 'reg' && t('✅ Decided in normal or extra time — no penalties', '✅ Se define en el tiempo reglamentario o extra: sin penales')}
              {outcome.phase === 'shootout' && t('🥅 Goes to a penalty shootout', '🥅 Se va a tanda de penales')}
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
          <div className="notice notice-info">
            {locked
              ? t('Predictions are locked for this match.', 'Los pronósticos están cerrados para este partido.')
              : t('Predictions open once the teams are confirmed.', 'Los pronósticos se abren cuando se confirmen los equipos.')}
          </div>
        )}
      </form>

      {locked && picks.length > 0 && (
        <div className="form-card">
          <div className="rule-card-head">
            <span className="rule-icon">👀</span>
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
                  <div key={p.user_id} className={`pick-row ${isMe ? 'pick-row-me' : ''}`}>
                    <span
                      className={`pick-avatar ${p.emoji ? 'avatar-emoji' : ''}`}
                      style={p.emoji ? undefined : { background: avatarGradient(p.user_id) }}
                    >
                      {p.emoji || (p.nickname || p.display_name || '?').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="pick-who">
                      {p.nickname || p.display_name}
                      {isMe && <span className="you-tag">{t('YOU', 'TÚ')}</span>}
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
  return (
    <div className="stepper">
      <span className="stepper-flag">{flag}</span>
      <span className="stepper-team">{team}</span>
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
          {value === null ? <span className="step-empty" aria-label={t('not set', 'sin definir')} /> : value}
        </span>
        <button
          type="button"
          className="step-btn"
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
