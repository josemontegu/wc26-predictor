import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppConfig, Match } from '../lib/types'
import { resolveOutcome } from '../lib/types'
import { teamFlag } from '../lib/teamMeta'
import { isoToLocalInput, localInputToIso, defaultLockIso } from '../lib/datetime'

interface Props {
  match: Match
  config: AppConfig | null
  onSaved: (m: Match) => void
}

export default function AdminMatchRow({ match, config, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [home, setHome] = useState(match.home_team)
  const [away, setAway] = useState(match.away_team)
  const [kickoff, setKickoff] = useState(isoToLocalInput(match.kickoff_time))
  const [lock, setLock] = useState(isoToLocalInput(match.lock_time))
  const [homeScore, setHomeScore] = useState(
    match.home_score === null ? '' : String(match.home_score),
  )
  const [awayScore, setAwayScore] = useState(
    match.away_score === null ? '' : String(match.away_score),
  )
  const [advancing, setAdvancing] = useState(match.advancing_team ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  function applyDefaultLock() {
    const kickoffIso = localInputToIso(kickoff)
    const iso = defaultLockIso(kickoffIso, config?.lock_minutes_before_kickoff ?? 60)
    setLock(isoToLocalInput(iso))
  }

  // Result consistency: one final score (after extra time), then penalties and
  // the advancing team are derived from it — never contradictory.
  const hsN = homeScore === '' ? null : Number(homeScore)
  const asN = awayScore === '' ? null : Number(awayScore)
  const resultIn = hsN !== null && asN !== null
  const outcome = resultIn ? resolveOutcome(hsN!, asN!) : null
  const winnerTeam = outcome?.winnerSide
    ? outcome.winnerSide === 'home'
      ? home.trim()
      : away.trim()
    : ''
  const isShootout = outcome?.phase === 'shootout'

  // Lock the advancing team to the winner of a decisive score.
  useEffect(() => {
    if (outcome?.winnerSide && advancing !== winnerTeam) setAdvancing(winnerTeam)
  }, [outcome?.winnerSide, winnerTeam, advancing])

  async function save() {
    setBusy(true)
    setError(null)
    setSavedTick(false)

    // Derive penalties / advancing from the entered final score so the stored
    // result can never be self-contradictory.
    const o = resultIn ? resolveOutcome(hsN!, asN!) : null
    const adv = o?.winnerSide
      ? o.winnerSide === 'home'
        ? home.trim()
        : away.trim()
      : advancing || null

    const update = {
      home_team: home.trim() || 'TBD',
      away_team: away.trim() || 'TBD',
      kickoff_time: localInputToIso(kickoff),
      lock_time: localInputToIso(lock),
      home_score: hsN,
      away_score: asN,
      aet_home_score: null,
      aet_away_score: null,
      went_to_penalties: o ? o.penalties : null,
      advancing_team: adv,
    }

    const { data, error } = await supabase
      .from('matches')
      .update(update)
      .eq('id', match.id)
      .select()
      .single()

    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setSavedTick(true)
    onSaved(data as Match)
  }

  const teamOptions = [home, away].filter((t) => t && t !== 'TBD')

  return (
    <div className="admin-row">
      <button className="admin-row-head" onClick={() => setOpen((o) => !o)}>
        <span className="admin-row-head-l">
          {match.match_no && <span className="muted small">#{match.match_no}</span>}
          <span className="admin-row-title">
            {teamFlag(match.home_team)} {match.home_team} v {match.away_team}{' '}
            {teamFlag(match.away_team)}
          </span>
        </span>
        <span className="admin-row-meta">
          {match.home_score !== null && match.away_score !== null
            ? `${match.home_score}–${match.away_score}`
            : '—'}{' '}
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="admin-row-body">
          <div className="admin-grid">
            <label>
              Home team
              <input value={home} onChange={(e) => setHome(e.target.value)} />
            </label>
            <label>
              Away team
              <input value={away} onChange={(e) => setAway(e.target.value)} />
            </label>
          </div>

          <label>
            Kick-off (local time)
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
            />
          </label>

          <label>
            Lock time (predictions close)
            <input
              type="datetime-local"
              value={lock}
              onChange={(e) => setLock(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={applyDefaultLock}>
            Set lock = kick-off − {config?.lock_minutes_before_kickoff ?? 60} min
          </button>

          <hr className="divider" />
          <div className="admin-section-label">Result (final score, after extra time)</div>
          <div className="admin-grid">
            <label>
              Home score
              <input
                type="number"
                min={0}
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
              />
            </label>
            <label>
              Away score
              <input
                type="number"
                min={0}
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
              />
            </label>
          </div>

          {isShootout && (
            <label>
              Shootout winner advances
              <select value={advancing} onChange={(e) => setAdvancing(e.target.value)}>
                <option value="">— pick winner —</option>
                {teamOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}

          {outcome && (
            <p className="muted small">
              {outcome.phase === 'reg' && `${winnerTeam} won — advances, no penalties.`}
              {outcome.phase === 'shootout' && 'Level after extra time → penalty shootout.'}
            </p>
          )}

          {error && <div className="notice notice-err">{error}</div>}
          {savedTick && <div className="notice notice-ok">Saved ✓</div>}

          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save match'}
          </button>
        </div>
      )}
    </div>
  )
}
