import { Link } from 'react-router-dom'
import type { Match, Prediction } from '../lib/types'
import { isLocked, hasResult } from '../lib/types'
import { formatTime, timeUntilLock } from '../lib/format'
import { teamFlag, isTBD, teamColor, teamName } from '../lib/teamMeta'
import { useT } from '../lib/i18n'
import Scoreline from './Scoreline'

interface Props {
  match: Match
  prediction?: Prediction
  points?: number | null
}

export default function MatchCard({ match, prediction, points }: Props) {
  const t = useT()
  const locked = isLocked(match)
  const played = hasResult(match)
  const kickedOff =
    !!match.kickoff_time && Date.now() >= new Date(match.kickoff_time).getTime()
  const live = locked && !played && kickedOff
  // Still open, teams known, and the viewer hasn't predicted it yet.
  const needsPick =
    !locked && !played && !prediction && !isTBD(match.home_team) && !isTBD(match.away_team)

  return (
    <Link
      to={`/match/${match.id}`}
      className={`mcard ${played ? 'mcard-played' : ''} ${needsPick ? 'mcard-unpicked' : ''}`}
    >
      <span
        className="mcard-stripe"
        style={{
          background: `linear-gradient(90deg, ${teamColor(match.home_team)} 0 50%, ${teamColor(
            match.away_team,
          )} 50% 100%)`,
        }}
      />
      <div className="mcard-head">
        <span className="mcard-time">{formatTime(match.kickoff_time)}</span>
        {played ? (
          <span className="status status-done">{t('FT', 'Final')}</span>
        ) : live ? (
          <span className="status status-live">
            <span className="dot" /> {t('Live', 'En vivo')}
          </span>
        ) : locked ? (
          <span className="status status-locked">{t('Locked', 'Cerrado')}</span>
        ) : (
          <span className="status status-open">{t(`Closes in ${timeUntilLock(match.lock_time)}`, `Cierra en ${timeUntilLock(match.lock_time)}`)}</span>
        )}
      </div>

      <div className="mcard-body">
        <div className="mteam">
          <span className="flag">{teamFlag(match.home_team)}</span>
          <span className={`mteam-name ${isTBD(match.home_team) ? 'mteam-tbd' : ''}`}>
            {teamName(match.home_team)}
          </span>
        </div>
        {played ? (
          <Scoreline match={match} className="mscore" />
        ) : (
          <span className="mscore mscore-vs">{t('vs', 'vs')}</span>
        )}
        <div className="mteam mteam-r">
          <span className={`mteam-name ${isTBD(match.away_team) ? 'mteam-tbd' : ''}`}>
            {teamName(match.away_team)}
          </span>
          <span className="flag">{teamFlag(match.away_team)}</span>
        </div>
      </div>

      <div className="mcard-foot">
        {prediction ? (
          <span className="pick">
            <span className="pick-label">{t('Your pick:', 'Tu elección:')}</span> {prediction.home_score}–
            {prediction.away_score} · {teamName(prediction.advancing_team)}
            {prediction.penalties ? t(' (pens)', ' (penales)') : ''}
          </span>
        ) : (
          <span className={`pick ${locked ? 'pick-muted' : 'pick-cta'}`}>
            {locked ? t('No prediction', 'Sin pronóstico') : t('Tap to predict →', 'Toca para pronosticar →')}
          </span>
        )}

        {played && prediction && points != null && (
          <span className={`pts-badge ${points === 0 ? 'pts-badge-zero' : ''}`}>
            +{points} {t('pts', 'pts')}
          </span>
        )}
      </div>
    </Link>
  )
}
