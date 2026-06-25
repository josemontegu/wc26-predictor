import type {
  AppConfig,
  Award,
  AwardPrediction,
  Match,
  Prediction,
  Profile,
  Round,
  RoundCode,
} from './types'

// In-memory dataset powering demo mode (no Supabase needed). Mutations persist
// for the browser session so editing predictions updates the table live.
//
// This mirrors the REAL World Cup 2026 knockout calendar: official kick-off
// times, and the real bracket skeleton (group slots → match winners). Teams show
// as their slot ("2A", "Winner M74", …) until the group stage resolves them.

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
  { id: DEMO_USER_ID, display_name: 'Alex', nickname: 'Alex', emoji: '🦊', is_admin: true, created_at: '' },
  { id: 'u2', display_name: 'SammyGoals', nickname: 'SammyGoals', emoji: '🐲', is_admin: false, created_at: '' },
  { id: 'u3', display_name: 'PriyaP', nickname: 'PriyaP', emoji: '🦄', is_admin: false, created_at: '' },
  { id: 'u4', display_name: 'TommyB', nickname: 'TommyB', emoji: '🐻', is_admin: false, created_at: '' },
  { id: 'u5', display_name: 'Lu', nickname: 'Lu', emoji: '🦉', is_admin: false, created_at: '' },
  { id: 'u6', display_name: 'MarcoD', nickname: 'MarcoD', emoji: '🦁', is_admin: false, created_at: '' },
]

function mk(match_no: number, round: RoundCode, home: string, away: string, kickoffIso: string): Match {
  const lock = new Date(new Date(kickoffIso).getTime() - 60 * 60000).toISOString()
  return {
    id: `m${match_no}`,
    round,
    match_no,
    home_team: home,
    away_team: away,
    kickoff_time: kickoffIso,
    lock_time: lock,
    home_score: null,
    away_score: null,
    aet_home_score: null,
    aet_away_score: null,
    went_to_penalties: null,
    advancing_team: null,
    created_at: '',
    updated_at: '',
  }
}

// Real WC2026 knockout schedule (kick-offs in UTC) and bracket skeleton.
export const demoMatches: Match[] = [
  mk(73, 'R32', '2A', '2B', '2026-06-28T19:00:00Z'),
  mk(74, 'R32', 'Germany', '3A/B/C/D/F', '2026-06-29T20:30:00Z'),
  mk(75, 'R32', '1F', '2C', '2026-06-30T01:00:00Z'),
  mk(76, 'R32', '1C', '2F', '2026-06-29T17:00:00Z'),
  mk(77, 'R32', '1I', '3C/D/F/G/H', '2026-06-30T21:00:00Z'),
  mk(78, 'R32', '2E', '2I', '2026-06-30T17:00:00Z'),
  mk(79, 'R32', 'Mexico', '3C/E/F/H/I', '2026-07-01T01:00:00Z'),
  mk(80, 'R32', '1L', '3E/H/I/J/K', '2026-07-01T16:00:00Z'),
  mk(81, 'R32', 'USA', '3B/E/F/I/J', '2026-07-02T00:00:00Z'),
  mk(82, 'R32', '1G', '3A/E/H/I/J', '2026-07-01T20:00:00Z'),
  mk(83, 'R32', '2K', '2L', '2026-07-02T23:00:00Z'),
  mk(84, 'R32', '1H', '2J', '2026-07-02T19:00:00Z'),
  mk(85, 'R32', '1B', '3E/F/G/I/J', '2026-07-03T03:00:00Z'),
  mk(86, 'R32', '1J', '2H', '2026-07-03T22:00:00Z'),
  mk(87, 'R32', '1K', '3D/E/I/J/L', '2026-07-04T01:30:00Z'),
  mk(88, 'R32', '2D', '2G', '2026-07-03T18:00:00Z'),
  mk(89, 'R16', 'Winner M74', 'Winner M77', '2026-07-04T21:00:00Z'),
  mk(90, 'R16', 'Winner M73', 'Winner M75', '2026-07-04T17:00:00Z'),
  mk(91, 'R16', 'Winner M76', 'Winner M78', '2026-07-05T20:00:00Z'),
  mk(92, 'R16', 'Winner M79', 'Winner M80', '2026-07-06T00:00:00Z'),
  mk(93, 'R16', 'Winner M83', 'Winner M84', '2026-07-06T19:00:00Z'),
  mk(94, 'R16', 'Winner M81', 'Winner M82', '2026-07-07T00:00:00Z'),
  mk(95, 'R16', 'Winner M86', 'Winner M88', '2026-07-07T16:00:00Z'),
  mk(96, 'R16', 'Winner M85', 'Winner M87', '2026-07-07T20:00:00Z'),
  mk(97, 'QF', 'Winner M89', 'Winner M90', '2026-07-09T20:00:00Z'),
  mk(98, 'QF', 'Winner M93', 'Winner M94', '2026-07-10T19:00:00Z'),
  mk(99, 'QF', 'Winner M91', 'Winner M92', '2026-07-11T21:00:00Z'),
  mk(100, 'QF', 'Winner M95', 'Winner M96', '2026-07-12T01:00:00Z'),
  mk(101, 'SF', 'Winner M97', 'Winner M98', '2026-07-14T19:00:00Z'),
  mk(102, 'SF', 'Winner M99', 'Winner M100', '2026-07-15T19:00:00Z'),
  mk(103, 'TP', 'Loser M101', 'Loser M102', '2026-07-18T21:00:00Z'),
  mk(104, 'F', 'Winner M101', 'Winner M102', '2026-07-19T19:00:00Z'),
]

// A couple of sample picks for "me" so the "Your pick" state is visible; the
// rest are open. No results yet — the tournament hasn't kicked off.
export const demoPredictions: Prediction[] = [
  pred('m73', 1, 0, '2A'),
  pred('m76', 2, 1, '1C'),
  pred('m84', 2, 0, '1H'),
]

// No other-player predictions seeded: with no results they wouldn't affect the
// (empty) leaderboard, and matches aren't locked yet so picks stay hidden.
export const demoOtherPredictions: Prediction[] = []

// Tournament awards (no winners yet — decided at the end).
export const demoAwards: Award[] = [
  { id: 'aw0', key: 'champion', name: 'Champion', description: 'Winner of the World Cup', kind: 'team', points: 15, lock_time: '2026-06-28T19:00:00Z', winner: null, sort_order: 0 },
  { id: 'aw1', key: 'golden_ball', name: 'Golden Ball', description: 'Best player of the tournament', kind: 'player', points: 10, lock_time: '2026-06-28T19:00:00Z', winner: null, sort_order: 1 },
  { id: 'aw2', key: 'golden_boot', name: 'Golden Boot', description: 'Top scorer', kind: 'player', points: 10, lock_time: '2026-06-28T19:00:00Z', winner: null, sort_order: 2 },
  { id: 'aw3', key: 'golden_glove', name: 'Golden Glove', description: 'Best goalkeeper', kind: 'goalkeeper', points: 10, lock_time: '2026-06-28T19:00:00Z', winner: null, sort_order: 3 },
]

export const demoAwardPredictions: AwardPrediction[] = [
  { id: 'ap0', user_id: DEMO_USER_ID, award_id: 'aw0', pick: 'Argentina', created_at: '', updated_at: '' },
  { id: 'apa', user_id: DEMO_USER_ID, award_id: 'aw1', pick: 'Lamine Yamal', created_at: '', updated_at: '' },
  { id: 'apb', user_id: DEMO_USER_ID, award_id: 'aw2', pick: 'Kylian Mbappé', created_at: '', updated_at: '' },
]

function pred(
  match_id: string,
  hs: number,
  as: number,
  adv: string,
  user_id: string = DEMO_USER_ID,
): Prediction {
  return {
    id: `p-${user_id}-${match_id}`,
    user_id,
    match_id,
    home_score: hs,
    away_score: as,
    aet_home_score: null,
    aet_away_score: null,
    advancing_team: adv,
    penalties: false,
    created_at: '',
    updated_at: '',
  }
}
