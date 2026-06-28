import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { LockedPrediction, Match, MyScore, Prediction } from '../lib/types'
import { isLocked, hasResult, resolveOutcome } from '../lib/types'
import { ROUND_NAMES, formatKickoff, formatLock } from '../lib/format'
import { teamFlag, teamColor, avatarGradient } from '../lib/teamMeta'
import { fireConfetti } from '../lib/confetti'
import Spinner from '../components/Spinner'

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(99, n))
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

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
      setError('Pick which team wins the shootout.')
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
        <Spinner label="Loading match…" />
      </div>
    )
  }

  if (!match) {
    return (
      <div className="page">
        <p className="notice notice-err">Match not found.</p>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          ← Back to matches
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
        ← Back
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
          {ROUND_NAMES[match.round]}
          {match.match_no ? ` · Match ${match.match_no}` : ''}
        </span>
        <div className="detail-fixture">
          <div className="df-team">
            <span className="df-flag">{teamFlag(match.home_team)}</span>
            <span className="df-name">{match.home_team}</span>
          </div>
          {played ? (
            <span className="df-score">
              {match.home_score}–{match.away_score}
            </span>
          ) : (
            <span className="df-vs">VS</span>
          )}
          <div className="df-team">
            <span className="df-flag">{teamFlag(match.away_team)}</span>
            <span className="df-name">{match.away_team}</span>
          </div>
        </div>
        <div className="detail-meta">
          <span>🕒 Kick-off: {formatKickoff(match.kickoff_time)}</span>
          <span>
            🔒 Predictions {locked ? 'closed' : 'close'}: {formatLock(match.lock_time)}
          </span>
          {played && match.went_to_penalties !== null && (
            <span>🥅 Penalties: {match.went_to_penalties ? 'Yes' : 'No'}</span>
          )}
          {played && match.advancing_team && <span>✅ Advanced: {match.advancing_team}</span>}
        </div>
        {played && score && (
          <div className="detail-pts">
            🏅 You scored {score.total_points} pts on this match
          </div>
        )}
      </div>

      {!teamsKnown && (
        <div className="notice notice-info">
          Teams aren't confirmed yet. You can predict once the matchup is set.
        </div>
      )}

      <form onSubmit={handleSave} className="form-card">
        <h2>{prediction ? 'Your prediction' : 'Make your prediction'}</h2>

        <label className="field-label">
          Final score <span className="muted small">· after extra time, before penalties</span>
        </label>
        <div className="stepper-row">
          <ScoreStepper
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
            Tap + to set the final score (after extra time, if any) and make your prediction.
          </p>
        )}

        {showResolution && (
          <>
            <label className="field-label">Who advances?</label>
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
                {outcome.phase === 'reg' && `${lockedWinner} win and advance.`}
                {isShootout && 'Level after extra time — pick who wins the shootout.'}
              </p>
            )}

            <div className={`outcome-chip outcome-${outcome.phase}`}>
              {outcome.phase === 'reg' && '✅ Decided in normal or extra time — no penalties'}
              {outcome.phase === 'shootout' && '🥅 Goes to a penalty shootout'}
            </div>
          </>
        )}

        {error && <div className="notice notice-err">{error}</div>}
        {saved && <div className="notice notice-ok">Prediction saved ✓</div>}

        {canEdit ? (
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !bothSet || (isShootout && !advancing)}
          >
            {busy ? 'Saving…' : prediction ? 'Update prediction' : 'Submit prediction'}
          </button>
        ) : (
          <div className="notice notice-info">
            {locked
              ? 'Predictions are locked for this match.'
              : 'Predictions open once the teams are confirmed.'}
          </div>
        )}
      </form>

      {locked && picks.length > 0 && (
        <div className="form-card">
          <div className="rule-card-head">
            <span className="rule-icon">👀</span>
            <h2>Everyone's picks ({picks.length})</h2>
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
                      {isMe && <span className="you-tag">YOU</span>}
                    </span>
                    <span className={`pick-score ${exactRight ? 'pick-hit' : ''}`}>
                      {p.home_score}–{p.away_score}
                      {exactRight && ' ✓'}
                    </span>
                    <span className={`pick-adv ${advRight ? 'pick-hit' : ''}`}>
                      {teamFlag(p.advancing_team)}
                      {p.penalties ? ' 🥅' : ''}
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
  flag,
  team,
  value,
  disabled,
  atMin,
  onDec,
  onInc,
}: {
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
          aria-label={`decrease ${team} score`}
        >
          −
        </button>
        <span className="step-val">
          {value === null ? <span className="step-empty" aria-label="not set" /> : value}
        </span>
        <button
          type="button"
          className="step-btn"
          disabled={disabled}
          onClick={onInc}
          aria-label={`increase ${team} score`}
        >
          +
        </button>
      </div>
    </div>
  )
}
