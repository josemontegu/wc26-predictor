import type { Match } from '../lib/types'

/**
 * A finished match's score. When it was decided on penalties and the shootout
 * tally is known, it renders the regulation score with the tally as a small
 * superscript, e.g. 1³ – 1⁴ (the winner's number is highlighted).
 */
export default function Scoreline({ match, className }: { match: Match; className?: string }) {
  const pens =
    match.went_to_penalties &&
    match.pen_home_score != null &&
    match.pen_away_score != null
  const homeWon = pens && match.pen_home_score! > match.pen_away_score!

  return (
    <span className={className}>
      {match.home_score}
      {pens && <sup className={`pen-sup ${homeWon ? 'pen-sup-win' : ''}`}>{match.pen_home_score}</sup>}
      <span className="score-dash">–</span>
      {match.away_score}
      {pens && <sup className={`pen-sup ${!homeWon ? 'pen-sup-win' : ''}`}>{match.pen_away_score}</sup>}
    </span>
  )
}
