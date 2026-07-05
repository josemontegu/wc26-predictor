import type { Match } from '../lib/types'

/**
 * A finished match's score. When it was decided on penalties, the regulation
 * score stays the headline and the shootout tally is shown on a separate line
 * in parentheses ("(2–4)") — never fused onto the digit, which reads as a single
 * wrong number (1–1 with a 2–4 shootout must not look like 12–14). The winner's
 * shootout number is highlighted.
 */
export default function Scoreline({ match, className }: { match: Match; className?: string }) {
  const pens =
    match.went_to_penalties &&
    match.pen_home_score != null &&
    match.pen_away_score != null
  const homeWon = pens && match.pen_home_score! > match.pen_away_score!

  return (
    <span className={className}>
      <span className="sl-reg">
        {match.home_score}
        <span className="score-dash">–</span>
        {match.away_score}
      </span>
      {pens && (
        <span className="sl-pens">
          (<span className={homeWon ? 'sl-pen-win' : ''}>{match.pen_home_score}</span>
          <span className="score-dash">–</span>
          <span className={!homeWon ? 'sl-pen-win' : ''}>{match.pen_away_score}</span>)
        </span>
      )}
    </span>
  )
}
