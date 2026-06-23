import { Link } from 'react-router-dom'
import type { Match, Prediction } from '../lib/types'
import { isLocked, hasResult } from '../lib/types'
import { formatKickoff, timeUntilLock } from '../lib/format'
import { teamFlag, isTBD, teamColor } from '../lib/teamMeta'

interface Props {
  match: Match
  prediction?: Prediction
  points?: number | null
}

export default function MatchCard({ match, prediction, points }: Props) {
  const locked = isLocked(match)
  const played = hasResult(match)
  const kickedOff =
    !!match.kickoff_time && Date.now() >= new Date(match.kickoff_time).getTime()
  const live = locked && !played && kickedOff

  return (
    <Link to={`/match/${match.id}`} className={`mcard ${played ? 'mcard-played' : ''}`}>
      <span
        className="mcard-stripe"
        style={{
          background: `linear-gradient(90deg, ${teamColor(match.home_team)} 0 50%, ${teamColor(
            match.away_team,
          )} 50% 100%)`,
        }}
      />
      <div className="mcard-head">
        <span className="mcard-time">{formatKickoff(match.kickoff_time)}</span>
        {played ? (
          <span className="status status-done">FT</span>
        ) : live ? (
          <span className="status status-live">
            <span className="dot" /> Live
          </span>
        ) : locked ? (
          <span className="status status-locked">Locked</span>
        ) : (
          <span className="status status-open">Closes in {timeUntilLock(match.lock_time)}</span>
        )}
      </div>

      <div className="mcard-body">
        <div className="mteam">
          <span className="flag">{teamFlag(match.home_team)}</span>
          <span className={`mteam-name ${isTBD(match.home_team) ? 'mteam-tbd' : ''}`}>
            {match.home_team}
          </span>
        </div>
        <span className={`mscore ${played ? '' : 'mscore-vs'}`}>
          {played ? `${match.home_score} – ${match.away_score}` : 'vs'}
        </span>
        <div className="mteam mteam-r">
          <span className={`mteam-name ${isTBD(match.away_team) ? 'mteam-tbd' : ''}`}>
            {match.away_team}
          </span>
          <span className="flag">{teamFlag(match.away_team)}</span>
        </div>
      </div>

      {played && match.went_to_penalties && (
        <div className="mcard-pens">
          🥅 Penalties{match.advancing_team ? ` · ${match.advancing_team} advanced` : ''}
        </div>
      )}

      <div className="mcard-foot">
        {prediction ? (
          <span className="pick">
            ✓ {prediction.home_score}–{prediction.away_score} · {prediction.advancing_team}
            {prediction.penalties ? ' (pens)' : ''}
          </span>
        ) : (
          <span className={`pick ${locked ? 'pick-muted' : 'pick-cta'}`}>
            {locked ? 'No prediction' : 'Tap to predict →'}
          </span>
        )}

        {played && prediction && points != null && (
          <span className={`pts-badge ${points === 0 ? 'pts-badge-zero' : ''}`}>
            +{points} pts
          </span>
        )}
      </div>
    </Link>
  )
}
