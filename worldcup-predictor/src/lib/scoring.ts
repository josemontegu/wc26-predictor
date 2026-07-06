// Single source of truth for how a prediction scores against a result.
//
// This mirrors the DB's `prediction_scores` view exactly. The value clients see
// (leaderboard drill-downs, per-match points, stats) must match what Postgres
// computes, so the formula lives here once and is unit-tested — rather than
// being re-implemented in each page.

/** The prediction side: what the player called. */
export interface PredictionInput {
  home_score: number
  away_score: number
  advancing_team: string
  penalties: boolean
}

/** The result side: the final match outcome (nullable until the match is played). */
export interface ResultInput {
  home_score: number | null
  away_score: number | null
  advancing_team: string | null
  went_to_penalties: boolean | null
}

/** The configurable per-component point values. */
export interface ScoringConfig {
  points_tendency: number
  points_exact: number
  points_advance: number
  points_penalties: number
}

export interface ScoreBreakdown {
  /** Right 1/X/2 outcome (home win / draw / away win). */
  rightResult: boolean
  /** Exact final scoreline. */
  exact: boolean
  /** Correct team advancing. */
  advancingRight: boolean
  /** Correctly called whether it went to a shootout. */
  penaltiesRight: boolean
  /** Total points, already multiplied by the round multiplier. */
  points: number
}

const ZERO: ScoreBreakdown = {
  rightResult: false,
  exact: false,
  advancingRight: false,
  penaltiesRight: false,
  points: 0,
}

/**
 * Score a single prediction against a match result.
 *
 * Components stack: a right result, an exact score on top, the advancing team,
 * and the penalties call are each awarded independently, then the total is
 * multiplied by the round multiplier. An unplayed match (null scores) scores 0.
 */
export function scorePrediction(
  pick: PredictionInput,
  result: ResultInput,
  config: ScoringConfig,
  multiplier = 1,
): ScoreBreakdown {
  if (result.home_score == null || result.away_score == null) return { ...ZERO }

  const rightResult =
    Math.sign(pick.home_score - pick.away_score) ===
    Math.sign(result.home_score - result.away_score)
  const exact = pick.home_score === result.home_score && pick.away_score === result.away_score
  const advancingRight =
    result.advancing_team != null && pick.advancing_team === result.advancing_team
  const penaltiesRight =
    result.went_to_penalties != null && pick.penalties === result.went_to_penalties

  let points = 0
  if (advancingRight) points += config.points_advance * multiplier
  if (exact) points += config.points_exact * multiplier
  if (rightResult) points += config.points_tendency * multiplier
  if (penaltiesRight) points += config.points_penalties * multiplier

  return { rightResult, exact, advancingRight, penaltiesRight, points }
}

/** Convenience: just the points a prediction earned. */
export function scorePoints(
  pick: PredictionInput,
  result: ResultInput,
  config: ScoringConfig,
  multiplier = 1,
): number {
  return scorePrediction(pick, result, config, multiplier).points
}
