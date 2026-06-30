import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppConfig, Match } from '../lib/types'
import { resolveOutcome } from '../lib/types'
import { teamFlag } from '../lib/teamMeta'
import { isoToLocalInput, localInputToIso, defaultLockIso } from '../lib/datetime'
import { useT } from '../lib/i18n'

interface Props {
  match: Match
  config: AppConfig | null
  onSaved: (m: Match) => void
}

export default function AdminMatchRow({ match, config, onSaved }: Props) {
  const t = useT()
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
  const [penHome, setPenHome] = useState(
    match.pen_home_score === null ? '' : String(match.pen_home_score),
  )
  const [penAway, setPenAway] = useState(
    match.pen_away_score === null ? '' : String(match.pen_away_score),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  function applyDefaultLock() {
    const kickoffIso = localInputToIso(kickoff)
    const iso = defaultLockIso(kickoffIso, config?.lock_minutes_before_kickoff ?? 1)
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

  // Optional penalty-shootout tally (display only). When entered, it decides who
  // advances; without it, the admin picks the shootout winner manually.
  const penHN = penHome === '' ? null : Number(penHome)
  const penAN = penAway === '' ? null : Number(penAway)
  const pensIn = isShootout && penHN !== null && penAN !== null && penHN !== penAN
  const penWinner = pensIn ? (penHN! > penAN! ? home.trim() : away.trim()) : ''

  // Lock the advancing team to whoever won: the decisive score, or the shootout.
  useEffect(() => {
    if (outcome?.winnerSide) {
      if (advancing !== winnerTeam) setAdvancing(winnerTeam)
    } else if (pensIn && advancing !== penWinner) {
      setAdvancing(penWinner)
    }
  }, [outcome?.winnerSide, winnerTeam, pensIn, penWinner, advancing])

  // Clear the penalty tally if the score is no longer a shootout.
  useEffect(() => {
    if (!isShootout) {
      if (penHome !== '') setPenHome('')
      if (penAway !== '') setPenAway('')
    }
  }, [isShootout, penHome, penAway])

  async function save() {
    setBusy(true)
    setError(null)
    setSavedTick(false)

    // Derive penalties / advancing from the entered scores so the stored result
    // can never be self-contradictory.
    const o = resultIn ? resolveOutcome(hsN!, asN!) : null
    const isPens = o?.phase === 'shootout'
    const penH = isPens && penHN !== null ? penHN : null
    const penA = isPens && penAN !== null ? penAN : null
    if (penH !== null && penA !== null && penH === penA) {
      setBusy(false)
      setError(t('A penalty shootout needs a winner — the tallies can’t be equal.', 'Una tanda de penales necesita ganador: los marcadores no pueden ser iguales.'))
      return
    }
    const adv = o?.winnerSide
      ? o.winnerSide === 'home'
        ? home.trim()
        : away.trim()
      : penH !== null && penA !== null
        ? penH > penA
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
      pen_home_score: penH,
      pen_away_score: penA,
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
              {t('Home team', 'Equipo local')}
              <input value={home} onChange={(e) => setHome(e.target.value)} />
            </label>
            <label>
              {t('Away team', 'Equipo visitante')}
              <input value={away} onChange={(e) => setAway(e.target.value)} />
            </label>
          </div>

          <label>
            {t('Kick-off (local time)', 'Inicio (hora local)')}
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
            />
          </label>

          <label>
            {t('Lock time (predictions close)', 'Hora de cierre (los pronósticos cierran)')}
            <input
              type="datetime-local"
              value={lock}
              onChange={(e) => setLock(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={applyDefaultLock}>
            {t(
              `Set lock = kick-off − ${config?.lock_minutes_before_kickoff ?? 1} min`,
              `Cierre = inicio − ${config?.lock_minutes_before_kickoff ?? 1} min`,
            )}
          </button>

          <hr className="divider" />
          <div className="admin-section-label">
            {t(
              'Result (final score, after extra time)',
              'Resultado (marcador final, tras el tiempo extra)',
            )}
          </div>
          <div className="admin-grid">
            <label>
              {t('Home score', 'Marcador local')}
              <input
                type="number"
                min={0}
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
              />
            </label>
            <label>
              {t('Away score', 'Marcador visitante')}
              <input
                type="number"
                min={0}
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
              />
            </label>
          </div>

          {isShootout && (
            <>
              <div className="admin-section-label">
                {t('Penalty shootout (optional)', 'Tanda de penales (opcional)')}
              </div>
              <div className="admin-grid">
                <label>
                  {home.trim() || 'Home'}
                  <input
                    type="number"
                    min={0}
                    value={penHome}
                    onChange={(e) => setPenHome(e.target.value)}
                  />
                </label>
                <label>
                  {away.trim() || 'Away'}
                  <input
                    type="number"
                    min={0}
                    value={penAway}
                    onChange={(e) => setPenAway(e.target.value)}
                  />
                </label>
              </div>
              <label>
                {t('Shootout winner advances', 'Ganador de la tanda avanza')}
                <select
                  value={advancing}
                  disabled={pensIn}
                  onChange={(e) => setAdvancing(e.target.value)}
                >
                  <option value="">{t('— pick winner —', '— elige ganador —')}</option>
                  {teamOptions.map((tm) => (
                    <option key={tm} value={tm}>
                      {tm}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {outcome && (
            <p className="muted small">
              {outcome.phase === 'reg' &&
                t(
                  `${winnerTeam} won — advances, no penalties.`,
                  `${winnerTeam} ganó: avanza, sin penales.`,
                )}
              {outcome.phase === 'shootout' &&
                t(
                  'Level after extra time → penalty shootout.',
                  'Empate tras el tiempo extra → tanda de penales.',
                )}
            </p>
          )}

          {error && <div className="notice notice-err">{error}</div>}
          {savedTick && <div className="notice notice-ok">{t('Saved ✓', 'Guardado ✓')}</div>}

          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? t('Saving…', 'Guardando…') : t('Save match', 'Guardar partido')}
          </button>
        </div>
      )}
    </div>
  )
}
