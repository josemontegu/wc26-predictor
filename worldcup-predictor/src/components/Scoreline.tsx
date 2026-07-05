import type { Match } from '../lib/types'
import { useT } from '../lib/i18n'

/**
 * A finished match's score. When it was decided on penalties, the regulation
 * score stays the headline and the shootout tally is shown on a separate,
 * clearly-labelled line ("pens 3–4") — never fused onto the digit, which reads
 * as a single wrong number (1–1 with a 3–4 shootout must not look like 13–14).
 * The winner's shootout number is highlighted.
 */
export default function Scoreline({ match, className }: { match: Match; className?: string }) {
  const t = useT()
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
          {t('pens', 'pen.')}{' '}
          <span className={homeWon ? 'sl-pen-win' : ''}>{match.pen_home_score}</span>
          <span className="score-dash">–</span>
          <span className={!homeWon ? 'sl-pen-win' : ''}>{match.pen_away_score}</span>
        </span>
      )}
    </span>
  )
}
