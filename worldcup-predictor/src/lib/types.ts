export type RoundCode = 'R32' | 'R16' | 'QF' | 'SF' | 'TP' | 'F'

export interface Round {
  code: RoundCode
  name: string
  sort_order: number
  multiplier: number
}

export interface Profile {
  id: string
  display_name: string
  nickname: string
  emoji: string
  is_admin: boolean
  created_at: string
}

export interface AppConfig {
  id: number
  points_advance: number
  points_exact: number
  points_tendency: number
  points_penalties: number
  points_exact_aet: number
  lock_minutes_before_kickoff: number
}

export interface Match {
  id: string
  round: RoundCode
  match_no: number | null
  home_team: string
  away_team: string
  kickoff_time: string | null
  lock_time: string | null
  home_score: number | null
  away_score: number | null
  aet_home_score: number | null
  aet_away_score: number | null
  went_to_penalties: boolean | null
  advancing_team: string | null
  created_at: string
  updated_at: string
}

export interface Prediction {
  id: string
  user_id: string
  match_id: string
  home_score: number
  away_score: number
  aet_home_score: number | null
  aet_away_score: number | null
  advancing_team: string
  penalties: boolean
  created_at: string
  updated_at: string
}

export interface LeaderboardRow {
  user_id: string
  display_name: string
  nickname: string
  emoji: string
  total_points: number
  scored_predictions: number
  correct_advances: number
  exact_scores: number
}

export type AwardKind = 'team' | 'player' | 'goalkeeper'

export interface Award {
  id: string
  key: string
  name: string
  description: string | null
  kind: AwardKind
  points: number
  lock_time: string | null
  winner: string | null
  sort_order: number
}

export interface AwardPrediction {
  id: string
  user_id: string
  award_id: string
  pick: string
  created_at: string
  updated_at: string
}

/** An award is locked once its lock_time has passed. No lock_time = open. */
export function awardLocked(award: Pick<Award, 'lock_time'>): boolean {
  if (!award.lock_time) return false
  return Date.now() >= new Date(award.lock_time).getTime()
}

export interface LockedPrediction {
  match_id: string
  user_id: string
  nickname: string
  display_name: string
  emoji: string
  home_score: number
  away_score: number
  advancing_team: string
  penalties: boolean
}

export interface PlayerStat {
  user_id: string
  nickname: string
  emoji: string
  pts_advance: number
  pts_exact: number
  pts_tendency: number
  pts_penalties: number
  pts_exact_aet: number
  pts_awards: number
  scored: number
  correct_advances: number
  exact_scores: number
  correct_tendencies: number
  zero_points: number
}

export interface LockedAwardPrediction {
  award_key: string
  award_name: string
  award_kind: AwardKind
  user_id: string
  nickname: string
  emoji: string
  pick: string
}

export interface MyScore {
  prediction_id: string
  user_id: string
  match_id: string
  round: RoundCode
  pts_advance: number
  pts_exact: number
  pts_tendency: number
  pts_penalties: number
  pts_exact_aet: number
  total_points: number
}

export type OutcomePhase = 'reg' | 'aet' | 'shootout'

export interface Outcome {
  phase: OutcomePhase // settled in 90' / extra time / shootout
  winnerSide: 'home' | 'away' | null // null only on a shootout (free pick)
  penalties: boolean
  aetNeeded: boolean // a 90' draw needs an extra-time score
}

/**
 * The single source of truth for how a knockout match resolves, given the
 * 90-minute score and (when level) the after-extra-time score.
 */
export function resolveOutcome(
  home: number,
  away: number,
  aetHome: number | null,
  aetAway: number | null,
): Outcome {
  if (home !== away) {
    return { phase: 'reg', winnerSide: home > away ? 'home' : 'away', penalties: false, aetNeeded: false }
  }
  // Level at 90' → extra time.
  if (aetHome == null || aetAway == null) {
    return { phase: 'aet', winnerSide: null, penalties: false, aetNeeded: true }
  }
  if (aetHome !== aetAway) {
    return { phase: 'aet', winnerSide: aetHome > aetAway ? 'home' : 'away', penalties: false, aetNeeded: true }
  }
  // Still level after extra time → penalty shootout.
  return { phase: 'shootout', winnerSide: null, penalties: true, aetNeeded: true }
}

/** A match is locked once its lock_time has passed (or it has no lock_time set). */
export function isLocked(match: Pick<Match, 'lock_time'>): boolean {
  if (!match.lock_time) return true
  return Date.now() >= new Date(match.lock_time).getTime()
}

/** A match has a result once a 90' score has been entered. */
export function hasResult(match: Pick<Match, 'home_score' | 'away_score'>): boolean {
  return match.home_score !== null && match.away_score !== null
}
