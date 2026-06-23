import type { AppConfig, Match, Prediction, Profile, Round, RoundCode } from './types'

// In-memory dataset powering demo mode (no Supabase needed). Mutations persist
// for the browser session so editing predictions/results updates the table live.

export const DEMO_USER_ID = 'demo-me'
export const DEMO_EMAIL = 'alex@demo.app'

export const demoRounds: Round[] = [
  { code: 'R32', name: 'Round of 32', sort_order: 1, multiplier: 1 },
  { code: 'R16', name: 'Round of 16', sort_order: 2, multiplier: 1.5 },
  { code: 'QF', name: 'Quarter-finals', sort_order: 3, multiplier: 2 },
  { code: 'SF', name: 'Semi-finals', sort_order: 4, multiplier: 3 },
  { code: 'TP', name: 'Third-place play-off', sort_order: 5, multiplier: 2 },
  { code: 'F', name: 'Final', sort_order: 6, multiplier: 4 },
]

export const demoConfig: AppConfig = {
  id: 1,
  points_advance: 5,
  points_exact: 4,
  points_tendency: 2,
  points_penalties: 2,
  points_exact_aet: 3,
  lock_minutes_before_kickoff: 60,
}

export const demoProfiles: Profile[] = [
  { id: DEMO_USER_ID, display_name: 'Alex Rivera', nickname: 'Alex', is_admin: true, created_at: '' },
  { id: 'u2', display_name: 'Sam Okafor', nickname: 'SammyGoals', is_admin: false, created_at: '' },
  { id: 'u3', display_name: 'Priya Nair', nickname: 'PriyaP', is_admin: false, created_at: '' },
  { id: 'u4', display_name: 'Tom Bauer', nickname: 'TommyB', is_admin: false, created_at: '' },
  { id: 'u5', display_name: 'Lucia Ferraro', nickname: 'Lu', is_admin: false, created_at: '' },
  { id: 'u6', display_name: 'Marc Dubois', nickname: 'MarcoD', is_admin: false, created_at: '' },
]

const HOUR = 3600_000
const DAY = 24 * HOUR
const now = () => Date.now()

function mk(
  match_no: number,
  round: RoundCode,
  home: string,
  away: string,
  kickoffOffsetMs: number,
  result?: { hs: number; as: number; aetH?: number; aetA?: number; pens: boolean; adv: string },
): Match {
  const kickoff = new Date(now() + kickoffOffsetMs).toISOString()
  const lock = new Date(now() + kickoffOffsetMs - 60 * 60000).toISOString()
  return {
    id: `m${match_no}`,
    round,
    match_no,
    home_team: home,
    away_team: away,
    kickoff_time: kickoff,
    lock_time: lock,
    home_score: result ? result.hs : null,
    away_score: result ? result.as : null,
    aet_home_score: result?.aetH ?? null,
    aet_away_score: result?.aetA ?? null,
    went_to_penalties: result ? result.pens : null,
    advancing_team: result ? result.adv : null,
    created_at: '',
    updated_at: '',
  }
}

export const demoMatches: Match[] = [
  // Played (results in)
  mk(73, 'R32', 'Argentina', 'Nigeria', -3 * DAY, { hs: 2, as: 1, pens: false, adv: 'Argentina' }),
  mk(74, 'R32', 'France', 'Senegal', -3 * DAY, { hs: 1, as: 1, aetH: 1, aetA: 1, pens: true, adv: 'Senegal' }),
  mk(75, 'R32', 'Brazil', 'South Korea', -2 * DAY, { hs: 4, as: 1, pens: false, adv: 'Brazil' }),
  mk(76, 'R32', 'Spain', 'Morocco', -2 * DAY, { hs: 0, as: 0, aetH: 0, aetA: 0, pens: true, adv: 'Morocco' }),
  // Locked, no result yet (kickoff imminent / underway)
  mk(77, 'R32', 'Germany', 'Japan', -0.4 * HOUR),
  // Open for predictions (upcoming)
  mk(78, 'R32', 'Portugal', 'Croatia', 6 * HOUR),
  mk(79, 'R32', 'Netherlands', 'Mexico', 1 * DAY),
  mk(80, 'R32', 'England', 'Ecuador', 1 * DAY + 4 * HOUR),
  mk(81, 'R32', 'Belgium', 'USA', 2 * DAY),
  mk(82, 'R32', 'Italy', 'Canada', 2 * DAY + 4 * HOUR),
  // Later rounds, teams TBD
  mk(89, 'R16', 'TBD', 'TBD', 5 * DAY),
  mk(90, 'R16', 'TBD', 'TBD', 5 * DAY + 4 * HOUR),
  mk(97, 'QF', 'TBD', 'TBD', 9 * DAY),
  mk(101, 'SF', 'TBD', 'TBD', 14 * DAY),
  mk(103, 'TP', 'TBD', 'TBD', 17 * DAY),
  mk(104, 'F', 'TBD', 'TBD', 18 * DAY),
]

// "Me" predictions across played + upcoming matches.
export const demoPredictions: Prediction[] = [
  pred('m73', 2, 1, 'Argentina', false), // exact + adv + tendency
  pred('m74', 2, 0, 'France', false), // all wrong-ish
  pred('m75', 3, 0, 'Brazil', false), // adv + tendency
  pred('m76', 1, 1, 'Morocco', true), // adv + tendency + pens
  pred('m77', 1, 0, 'Germany', false), // locked, awaiting result
  pred('m78', 2, 1, 'Portugal', false), // open
]

// A spread of other players' predictions so the leaderboard and the
// "everyone's picks" reveal (on locked matches m73–m77) have texture.
export const demoOtherPredictions: Prediction[] = [
  ...spread('u2', { m73: [2, 1, 'Argentina', false], m74: [1, 1, 'Senegal', true], m75: [2, 1, 'Brazil', false], m76: [0, 1, 'Morocco', false], m77: [2, 1, 'Germany', false] }),
  ...spread('u3', { m73: [1, 0, 'Argentina', false], m74: [0, 0, 'France', true], m75: [3, 1, 'Brazil', false], m76: [0, 0, 'Spain', true], m77: [0, 1, 'Japan', false] }),
  ...spread('u4', { m73: [3, 2, 'Argentina', false], m75: [4, 1, 'Brazil', false], m76: [1, 1, 'Morocco', true], m77: [1, 1, 'Germany', true] }),
  ...spread('u5', { m73: [0, 1, 'Nigeria', false], m74: [2, 1, 'France', false], m75: [1, 0, 'Brazil', false], m77: [3, 0, 'Germany', false] }),
  ...spread('u6', { m74: [1, 1, 'Senegal', true], m76: [0, 0, 'Morocco', true], m77: [2, 2, 'Japan', true] }),
]

function pred(
  match_id: string,
  hs: number,
  as: number,
  adv: string,
  penalties: boolean,
  user_id: string = DEMO_USER_ID,
): Prediction {
  // In the demo, every predicted 90' draw is a shootout, so the extra-time
  // score equals the 90' score (still level) and penalties is true.
  const draw = hs === as
  return {
    id: `p-${user_id}-${match_id}`,
    user_id,
    match_id,
    home_score: hs,
    away_score: as,
    aet_home_score: draw ? hs : null,
    aet_away_score: draw ? as : null,
    advancing_team: adv,
    penalties,
    created_at: '',
    updated_at: '',
  }
}

function spread(
  user_id: string,
  rows: Record<string, [number, number, string, boolean]>,
): Prediction[] {
  return Object.entries(rows).map(([mid, [hs, as, adv, pen]]) =>
    pred(mid, hs, as, adv, pen, user_id),
  )
}
