import type {
  AdminPlayerEmail,
  AppConfig,
  Award,
  AwardPrediction,
  Bullet,
  BulletPick,
  Match,
  Prediction,
  Profile,
  Round,
  RoundCode,
} from './types'

// In-memory dataset powering demo mode (no Supabase needed). It simulates a
// tournament a few days into the Round of 32: real teams, some matches played,
// everyone's predictions in, and awards locked — so every screen (leaderboard,
// everyone's picks, stats) is populated. The live app uses real Supabase data.

export const DEMO_USER_ID = 'demo-me'
export const DEMO_EMAIL = 'alex@demo.app'

export const demoRounds: Round[] = [
  { code: 'R32', name: 'Round of 32', sort_order: 1, multiplier: 1 },
  { code: 'R16', name: 'Round of 16', sort_order: 2, multiplier: 2 },
  { code: 'QF', name: 'Quarter-finals', sort_order: 3, multiplier: 3 },
  { code: 'SF', name: 'Semi-finals', sort_order: 4, multiplier: 4 },
  { code: 'TP', name: 'Third-place play-off', sort_order: 5, multiplier: 2 },
  { code: 'F', name: 'Final', sort_order: 6, multiplier: 5 },
]

export const demoConfig: AppConfig = {
  id: 1,
  points_advance: 4,
  points_exact: 4,
  points_tendency: 2,
  points_penalties: 0,
  points_exact_aet: 0,
  lock_minutes_before_kickoff: 1,
}

export const demoProfiles: Profile[] = [
  { id: DEMO_USER_ID, display_name: 'Alex', nickname: 'Alex', emoji: '🦊', is_admin: true, official: true, created_at: '' },
  { id: 'u2', display_name: 'SammyGoals', nickname: 'SammyGoals', emoji: '🐲', is_admin: false, official: true, created_at: '' },
  { id: 'u3', display_name: 'PriyaP', nickname: 'PriyaP', emoji: '🦄', is_admin: false, official: true, created_at: '' },
  { id: 'u4', display_name: 'TommyB', nickname: 'TommyB', emoji: '🐻', is_admin: false, official: true, created_at: '' },
  { id: 'u5', display_name: 'Lu', nickname: 'Lu', emoji: '🦉', is_admin: false, official: true, created_at: '' },
  // A mid-tournament joiner — shadow (unofficial) player.
  { id: 'u6', display_name: 'MarcoD', nickname: 'MarcoD', emoji: '🦁', is_admin: false, official: false, created_at: '' },
  // Invited but never opened the app — no nickname/emoji chosen yet.
  { id: 'u7', display_name: '', nickname: '', emoji: '', is_admin: false, official: true, created_at: '2026-06-15T09:00:00Z' },
  { id: 'u8', display_name: '', nickname: '', emoji: '', is_admin: false, official: true, created_at: '2026-06-20T14:30:00Z' },
]

// Admin-only: signup email for the pending (no-nickname) accounts above.
export const demoPlayerEmails: AdminPlayerEmail[] = [
  { id: 'u7', email: 'jordan@example.com' },
  { id: 'u8', email: 'sam@example.com' },
]

const USERS = [DEMO_USER_ID, 'u2', 'u3', 'u4', 'u5', 'u6']

const HOUR = 3600_000
const DAY = 24 * HOUR
const MINUTE = 60_000
const now = () => Date.now()

interface Result {
  hs: number // final score (after extra time, before penalties)
  as: number
  pens?: boolean
  penH?: number // shootout tally (when it went to penalties)
  penA?: number
  adv: string
}

function mk(
  match_no: number,
  round: RoundCode,
  home: string,
  away: string,
  offsetMs: number,
  result?: Result,
): Match {
  const kickoff = new Date(now() + offsetMs).toISOString()
  return {
    id: `m${match_no}`,
    round,
    match_no,
    home_team: home,
    away_team: away,
    kickoff_time: kickoff,
    lock_time: new Date(now() + offsetMs - MINUTE).toISOString(),
    home_score: result ? result.hs : null,
    away_score: result ? result.as : null,
    aet_home_score: null,
    aet_away_score: null,
    went_to_penalties: result ? !!result.pens : null,
    pen_home_score: result?.penH ?? null,
    pen_away_score: result?.penA ?? null,
    advancing_team: result ? result.adv : null,
    created_at: '',
    updated_at: '',
  }
}

export const demoMatches: Match[] = [
  // Round of 32 — 73–78 played, 79–81 locked (underway/imminent), 82–88 open
  mk(73, 'R32', 'Argentina', 'Australia', -4 * DAY, { hs: 2, as: 1, adv: 'Argentina' }),
  mk(74, 'R32', 'France', 'Senegal', -4 * DAY + 3 * HOUR, { hs: 1, as: 1, pens: true, penH: 3, penA: 4, adv: 'Senegal' }),
  mk(75, 'R32', 'Brazil', 'South Korea', -3 * DAY, { hs: 4, as: 1, adv: 'Brazil' }),
  mk(76, 'R32', 'Spain', 'Morocco', -3 * DAY + 3 * HOUR, { hs: 0, as: 0, pens: true, penH: 2, penA: 4, adv: 'Morocco' }),
  mk(77, 'R32', 'Germany', 'Japan', -2 * DAY, { hs: 2, as: 0, adv: 'Germany' }),
  mk(78, 'R32', 'Portugal', 'Croatia', -2 * DAY + 3 * HOUR, { hs: 3, as: 2, adv: 'Portugal' }),
  mk(79, 'R32', 'Netherlands', 'Mexico', -0.4 * HOUR),
  mk(80, 'R32', 'England', 'Ecuador', 5 * HOUR),
  mk(81, 'R32', 'Belgium', 'United States', 8 * HOUR),
  mk(82, 'R32', 'Italy', 'Canada', 1 * DAY),
  mk(83, 'R32', 'Uruguay', 'Ghana', 1 * DAY + 4 * HOUR),
  mk(84, 'R32', 'Colombia', 'Switzerland', 2 * DAY),
  mk(85, 'R32', 'Denmark', 'Poland', 2 * DAY + 4 * HOUR),
  mk(86, 'R32', 'Nigeria', 'Egypt', 3 * DAY),
  mk(87, 'R32', 'Norway', 'Sweden', 3 * DAY + 4 * HOUR),
  mk(88, 'R32', 'Austria', 'Serbia', 3 * DAY + 7 * HOUR),
  mk(89, 'R16', 'Winner M74', 'Winner M77', 6 * DAY),
  mk(90, 'R16', 'Winner M73', 'Winner M75', 6 * DAY + 4 * HOUR),
  mk(91, 'R16', 'Winner M76', 'Winner M78', 7 * DAY),
  mk(92, 'R16', 'Winner M79', 'Winner M80', 7 * DAY + 4 * HOUR),
  mk(93, 'R16', 'Winner M83', 'Winner M84', 8 * DAY),
  mk(94, 'R16', 'Winner M81', 'Winner M82', 8 * DAY + 4 * HOUR),
  mk(95, 'R16', 'Winner M86', 'Winner M88', 9 * DAY),
  mk(96, 'R16', 'Winner M85', 'Winner M87', 9 * DAY + 4 * HOUR),
  mk(97, 'QF', 'Winner M89', 'Winner M90', 11 * DAY),
  mk(98, 'QF', 'Winner M93', 'Winner M94', 12 * DAY),
  mk(99, 'QF', 'Winner M91', 'Winner M92', 13 * DAY),
  mk(100, 'QF', 'Winner M95', 'Winner M96', 13 * DAY + 4 * HOUR),
  mk(101, 'SF', 'Winner M97', 'Winner M98', 16 * DAY),
  mk(102, 'SF', 'Winner M99', 'Winner M100', 17 * DAY),
  mk(103, 'TP', 'Loser M101', 'Loser M102', 20 * DAY),
  mk(104, 'F', 'Winner M101', 'Winner M102', 21 * DAY),
]

// Per-match predictions for all six players (order = USERS). Tuple:
// [finalHome, finalAway, advancing]. A level final score means penalties (the
// advancing team is then the shootout pick); penalties is derived, not stored.
type Tup = [number, number, string]
const PREDS: Record<string, Tup[]> = {
  // played
  m73: [[2, 1, 'Argentina'], [2, 1, 'Argentina'], [1, 0, 'Argentina'], [3, 1, 'Argentina'], [1, 1, 'Argentina'], [0, 1, 'Australia']],
  m74: [[1, 1, 'Senegal'], [2, 0, 'France'], [1, 1, 'France'], [0, 0, 'Senegal'], [1, 2, 'Senegal'], [1, 1, 'Senegal']],
  m75: [[3, 0, 'Brazil'], [4, 1, 'Brazil'], [2, 1, 'Brazil'], [2, 0, 'Brazil'], [1, 1, 'Brazil'], [3, 1, 'Brazil']],
  m76: [[1, 1, 'Morocco'], [0, 0, 'Spain'], [0, 0, 'Morocco'], [2, 1, 'Spain'], [1, 0, 'Spain'], [0, 0, 'Morocco']],
  m77: [[2, 0, 'Germany'], [1, 0, 'Germany'], [2, 1, 'Germany'], [0, 1, 'Japan'], [3, 1, 'Germany'], [1, 1, 'Germany']],
  m78: [[2, 1, 'Portugal'], [3, 2, 'Portugal'], [1, 0, 'Portugal'], [2, 2, 'Croatia'], [3, 2, 'Portugal'], [1, 2, 'Croatia']],
  // open (future) — predicted early so the bullet has a "waiting on" tracker
  m82: [[1, 0, 'Italy'], [2, 1, 'Italy'], [0, 0, 'Italy'], [1, 1, 'Italy'], [2, 0, 'Italy'], [0, 1, 'Canada']],
  // locked, no result yet
  m79: [[2, 1, 'Netherlands'], [1, 1, 'Netherlands'], [0, 1, 'Mexico'], [2, 0, 'Netherlands'], [1, 0, 'Netherlands'], [2, 2, 'Mexico']],
  m80: [[2, 0, 'England'], [3, 1, 'England'], [1, 0, 'England'], [1, 1, 'England'], [2, 1, 'England'], [0, 0, 'Ecuador']],
  m81: [[1, 1, 'United States'], [2, 1, 'Belgium'], [1, 0, 'Belgium'], [0, 1, 'United States'], [2, 2, 'Belgium'], [1, 0, 'Belgium']],
}

export const demoPredictions: Prediction[] = []
export const demoOtherPredictions: Prediction[] = []
for (const [mid, rows] of Object.entries(PREDS)) {
  rows.forEach((t, i) => {
    const p: Prediction = {
      id: `p-${USERS[i]}-${mid}`,
      user_id: USERS[i],
      match_id: mid,
      home_score: t[0],
      away_score: t[1],
      advancing_team: t[2],
      penalties: t[0] === t[1], // a level final score → shootout
      aet_home_score: null,
      aet_away_score: null,
      created_at: '',
      updated_at: '',
    }
    ;(i === 0 ? demoPredictions : demoOtherPredictions).push(p)
  })
}

// Awards already locked (picks revealed for the pool), winners not decided yet.
const AWARD_LOCK = new Date(now() - 5 * DAY).toISOString()
export const demoAwards: Award[] = [
  { id: 'aw0', key: 'champion', name: 'Champion', description: 'Winner of the World Cup', kind: 'team', points: 15, lock_time: AWARD_LOCK, winner: null, sort_order: 0 },
  { id: 'aw1', key: 'golden_ball', name: 'Golden Ball', description: 'Best player of the tournament', kind: 'player', points: 10, lock_time: AWARD_LOCK, winner: null, sort_order: 1 },
  { id: 'aw2', key: 'golden_boot', name: 'Golden Boot', description: 'Top scorer', kind: 'player', points: 10, lock_time: AWARD_LOCK, winner: null, sort_order: 2 },
  { id: 'aw3', key: 'golden_glove', name: 'Golden Glove', description: 'Best goalkeeper', kind: 'goalkeeper', points: 10, lock_time: AWARD_LOCK, winner: null, sort_order: 3 },
]

const AWARD_PICKS: Record<string, [string, string, string, string]> = {
  // [champion, golden ball, golden boot, golden glove]
  [DEMO_USER_ID]: ['Argentina', 'Lamine Yamal', 'Kylian Mbappé', 'Emiliano Martínez'],
  u2: ['Brazil', 'Vinícius Júnior', 'Vinícius Júnior', 'Alisson'],
  u3: ['France', 'Kylian Mbappé', 'Kylian Mbappé', 'Mike Maignan'],
  u4: ['Argentina', 'Lionel Messi', 'Julián Alvarez', 'Emiliano Martínez'],
  u5: ['Spain', 'Lamine Yamal', 'Harry Kane', 'Unai Simón'],
  u6: ['Brazil', 'Jude Bellingham', 'Kylian Mbappé', 'Gianluigi Donnarumma'],
}

export const demoAwardPredictions: AwardPrediction[] = []
for (const [uid, picks] of Object.entries(AWARD_PICKS)) {
  ;['aw0', 'aw1', 'aw2', 'aw3'].forEach((awId, i) => {
    demoAwardPredictions.push({
      id: `ap-${uid}-${awId}`,
      user_id: uid,
      award_id: awId,
      pick: picks[i],
      created_at: '',
      updated_at: '',
    })
  })
}

// ---- ⚡ Bullets (demo) ------------------------------------------------------
// db1: open Yes/No (m82, Italy v Canada) — pick + "waiting on" tracker.
// db2: resolved & valid Yes/No (m73, played) — everyone answered → counts.
// db3: void Yes/No (m74, played) — not everyone answered → counts for no one.
// db4: resolved & valid multiple-choice (m75, played) — the N-option reveal.
// db5: open multiple-choice (m82) — the N-button pick state + tracker.
export const demoBullets: Bullet[] = [
  { id: 'db1', match_id: 'm82', question_en: 'Will there be a red card?', question_es: '¿Habrá tarjeta roja?', emoji: '🟥', points: 3, answer: null, options: null, created_at: '' },
  { id: 'db2', match_id: 'm73', question_en: 'Will Messi score?', question_es: '¿Messi marcará?', emoji: '⚽', points: 3, answer: 'yes', options: null, created_at: '' },
  { id: 'db3', match_id: 'm74', question_en: 'Will there be an own goal?', question_es: '¿Habrá autogol?', emoji: '🤦', points: 3, answer: 'no', options: null, created_at: '' },
  {
    id: 'db4', match_id: 'm75', question_en: 'How many goals in total?', question_es: '¿Cuántos goles en total?', emoji: '🔢', points: 4, answer: 'g4',
    options: [
      { key: 'g01', label_en: '0–1', label_es: '0–1' },
      { key: 'g2', label_en: '2', label_es: '2' },
      { key: 'g3', label_en: '3', label_es: '3' },
      { key: 'g4', label_en: '4+', label_es: '4+' },
    ],
    created_at: '',
  },
  {
    id: 'db5', match_id: 'm82', question_en: 'Who scores first?', question_es: '¿Quién marca primero?', emoji: '🥇', points: 4, answer: null,
    options: [
      { key: 'ita', label_en: 'Italy', label_es: 'Italia' },
      { key: 'can', label_en: 'Canada', label_es: 'Canadá' },
      { key: 'none', label_en: 'No goals', label_es: 'Sin goles' },
      { key: 'og', label_en: 'Own goal', label_es: 'Autogol' },
    ],
    created_at: '',
  },
]

export const demoBulletPicks: BulletPick[] = [
  // db1 (open): 3 of 5 official in; Alex & Lu still out
  { bullet_id: 'db1', user_id: 'u2', choice: 'yes', created_at: '' },
  { bullet_id: 'db1', user_id: 'u3', choice: 'no', created_at: '' },
  { bullet_id: 'db1', user_id: 'u4', choice: 'yes', created_at: '' },
  // db2 (valid): all 5 official in (+ guest for fun)
  { bullet_id: 'db2', user_id: DEMO_USER_ID, choice: 'yes', created_at: '' },
  { bullet_id: 'db2', user_id: 'u2', choice: 'yes', created_at: '' },
  { bullet_id: 'db2', user_id: 'u3', choice: 'no', created_at: '' },
  { bullet_id: 'db2', user_id: 'u4', choice: 'yes', created_at: '' },
  { bullet_id: 'db2', user_id: 'u5', choice: 'no', created_at: '' },
  { bullet_id: 'db2', user_id: 'u6', choice: 'yes', created_at: '' },
  // db3 (void): only 3 of 5 official in
  { bullet_id: 'db3', user_id: 'u2', choice: 'no', created_at: '' },
  { bullet_id: 'db3', user_id: 'u3', choice: 'yes', created_at: '' },
  { bullet_id: 'db3', user_id: 'u4', choice: 'no', created_at: '' },
  // db4 (valid multiple-choice): all 5 official in (+ guest), split across options
  { bullet_id: 'db4', user_id: DEMO_USER_ID, choice: 'g4', created_at: '' },
  { bullet_id: 'db4', user_id: 'u2', choice: 'g4', created_at: '' },
  { bullet_id: 'db4', user_id: 'u3', choice: 'g3', created_at: '' },
  { bullet_id: 'db4', user_id: 'u4', choice: 'g2', created_at: '' },
  { bullet_id: 'db4', user_id: 'u5', choice: 'g4', created_at: '' },
  { bullet_id: 'db4', user_id: 'u6', choice: 'g01', created_at: '' },
  // db5 (open multiple-choice): 3 of 5 official in; Alex & Lu still out
  { bullet_id: 'db5', user_id: 'u2', choice: 'ita', created_at: '' },
  { bullet_id: 'db5', user_id: 'u3', choice: 'can', created_at: '' },
  { bullet_id: 'db5', user_id: 'u4', choice: 'ita', created_at: '' },
]
