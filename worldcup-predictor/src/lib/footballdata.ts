// Live RESULTS source: football-data.org (v4). Unlike openfootball (volunteer
// commits that can trail full-time by hours), this is a real live feed. A
// finished knockout match carries the winner, the score split into
// regularTime / extraTime / penalties, and the shootout tally, so we get
// near-instant, complete results including the penalty score your app displays.
//
// Free tier: https://www.football-data.org/  (header auth: X-Auth-Token)
// Competition WC = FIFA World Cup (code "WC", id 2000).
//
// The catch vs openfootball: this feed has no notion of our app's match_no, so
// we map each fixture onto our `matches` rows by team, primarily via the FIFA
// 3-letter code the feed provides (`tla`), with a normalized-name fallback.

import type { RoundCode } from './types'
import type { MatchResultRow } from './openfootball'

export const FOOTBALL_DATA_URL =
  'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED'

// football-data stage → our RoundCode. Group games are ignored.
const STAGE_MAP: Record<string, RoundCode> = {
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  QUARTER_FINAL: 'QF',
  SEMI_FINALS: 'SF',
  SEMI_FINAL: 'SF',
  THIRD_PLACE: 'TP',
  THIRD_PLACE_PLAYOFF: 'TP',
  FINAL: 'F',
}

// Our DB (openfootball-derived) team names → FIFA 3-letter code. These are the
// 32 nations that reached the knockouts; later rounds are subsets. If a name
// isn't here we fall back to a normalized-name key, and unmatched fixtures are
// logged so any gap surfaces on the first run.
export const TEAM_TLA: Record<string, string> = {
  Algeria: 'ALG',
  Argentina: 'ARG',
  Australia: 'AUS',
  Austria: 'AUT',
  Belgium: 'BEL',
  'Bosnia & Herzegovina': 'BIH',
  Brazil: 'BRA',
  Canada: 'CAN',
  'Cape Verde': 'CPV',
  Colombia: 'COL',
  Croatia: 'CRO',
  'DR Congo': 'COD',
  Ecuador: 'ECU',
  Egypt: 'EGY',
  England: 'ENG',
  France: 'FRA',
  Germany: 'GER',
  Ghana: 'GHA',
  'Ivory Coast': 'CIV',
  Japan: 'JPN',
  Mexico: 'MEX',
  Morocco: 'MAR',
  Netherlands: 'NED',
  Norway: 'NOR',
  Paraguay: 'PAR',
  Portugal: 'POR',
  Senegal: 'SEN',
  'South Africa': 'RSA',
  Spain: 'ESP',
  Sweden: 'SWE',
  Switzerland: 'SUI',
  USA: 'USA',
}

/** Letters-only, accent- and "and"/"&"-insensitive team-name key. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(and|&)\b/g, ' ')
    .replace(/[^a-z]+/g, '')
}

interface FdScoreHalf {
  home: number | null
  away: number | null
}
interface FdScore {
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  duration?: string
  fullTime?: FdScoreHalf
  penalties?: FdScoreHalf
}
interface FdTeam {
  name?: string | null
  tla?: string | null
}
interface FdMatch {
  stage?: string
  status?: string
  homeTeam?: FdTeam
  awayTeam?: FdTeam
  score?: FdScore
}

/** A finished knockout fixture from football-data, normalized for matching. */
export interface FdKnockout {
  round: RoundCode
  homeName: string
  awayName: string
  homeTla: string
  awayTla: string
  finalHome: number // score after extra time (fullTime minus penalties)
  finalAway: number
  wentToPens: boolean
  penHome: number | null
  penAway: number | null
  winnerIsHome: boolean
}

/** Parse the raw football-data payload into finished knockout fixtures. */
export function parseFootballData(raw: unknown): FdKnockout[] {
  const matches = (raw as { matches?: FdMatch[] })?.matches ?? []
  const out: FdKnockout[] = []
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue
    const round = m.stage ? STAGE_MAP[m.stage] : undefined
    if (!round) continue // group stage / unknown
    const s = m.score
    const ft = s?.fullTime
    if (!ft || ft.home == null || ft.away == null) continue
    const homeName = m.homeTeam?.name?.trim()
    const awayName = m.awayTeam?.name?.trim()
    if (!homeName || !awayName) continue

    const pens = s?.penalties
    const wentToPens = s?.duration === 'PENALTY_SHOOTOUT' && pens?.home != null && pens?.away != null
    const penHome = wentToPens ? pens!.home! : null
    const penAway = wentToPens ? pens!.away! : null
    // Final score after ET = full time minus any shootout goals.
    const finalHome = ft.home - (penHome ?? 0)
    const finalAway = ft.away - (penAway ?? 0)

    const winner = s?.winner
    // Prefer the explicit winner; fall back to the on-pitch score.
    const winnerIsHome =
      winner === 'HOME_TEAM'
        ? true
        : winner === 'AWAY_TEAM'
          ? false
          : wentToPens
            ? penHome! > penAway!
            : finalHome > finalAway

    out.push({
      round,
      homeName,
      awayName,
      homeTla: (m.homeTeam?.tla || '').toUpperCase(),
      awayTla: (m.awayTeam?.tla || '').toUpperCase(),
      finalHome,
      finalAway,
      wentToPens,
      penHome,
      penAway,
      winnerIsHome,
    })
  }
  return out
}

export async function fetchFootballData(token: string): Promise<FdKnockout[]> {
  const res = await fetch(FOOTBALL_DATA_URL, {
    headers: { 'X-Auth-Token': token },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`football-data fetch failed: ${res.status} ${res.statusText}`)
  return parseFootballData(await res.json())
}

/** Canonical key for a DB team name: FIFA code if known, else normalized name. */
function dbKey(name: string): string {
  return TEAM_TLA[name] || normName(name)
}

type DbMatch = {
  match_no: number | null
  round: RoundCode | string
  home_team: string | null
  away_team: string | null
  home_score: number | null
  away_score: number | null
}

/**
 * Match football-data fixtures onto our DB rows (by FIFA code within a round,
 * then normalized name), orienting each result to the DB's home/away order.
 * Fill-only by default: rows already scored are left untouched. Returns the
 * update rows plus any finished fixtures we couldn't place (for logging).
 */
export function buildResultUpsertsFromFd(
  existing: DbMatch[],
  fd: FdKnockout[],
  opts: { overwrite?: boolean } = {},
): { rows: MatchResultRow[]; unmatched: FdKnockout[] } {
  // Index finished fixtures by round + unordered team-key pair, under both the
  // FIFA-code key and the normalized-name key, so either can find a match.
  // Team pairs are unique across a knockout bracket, so we match on the pair
  // alone (round-agnostic). This also lets sources that don't label the round
  // (e.g. ESPN's scoreboard) reuse this matcher.
  const pairKey = (a: string, b: string) => [a, b].sort().join('~')
  const index = new Map<string, FdKnockout>()
  for (const f of fd) {
    index.set(pairKey(f.homeTla, f.awayTla), f)
    index.set(pairKey(normName(f.homeName), normName(f.awayName)), f)
  }

  const rows: MatchResultRow[] = []
  // A feed fixture counts as "matched" whenever a DB row for it exists, even if
  // that row is already scored (and therefore skipped by fill-only). Only truly
  // absent rows end up in `unmatched`, so the warning means a real name/code gap.
  const matched = new Set<FdKnockout>()
  for (const m of existing) {
    if (m.match_no == null) continue
    const home = m.home_team?.trim()
    const away = m.away_team?.trim()
    if (!home || !away) continue // matchup not resolved yet

    const f =
      index.get(pairKey(dbKey(home), dbKey(away))) ||
      index.get(pairKey(normName(home), normName(away)))
    if (!f) continue
    matched.add(f)

    const alreadyScored = m.home_score != null && m.away_score != null
    if (alreadyScored && !opts.overwrite) continue

    // Orient the feed's home/away to our DB's ordering.
    const homeIsFeedHome =
      dbKey(home) === f.homeTla || normName(home) === normName(f.homeName)
    const swapped = !homeIsFeedHome
    const finalHome = swapped ? f.finalAway : f.finalHome
    const finalAway = swapped ? f.finalHome : f.finalAway
    const penHome = swapped ? f.penAway : f.penHome
    const penAway = swapped ? f.penHome : f.penAway
    const homeWon = swapped ? !f.winnerIsHome : f.winnerIsHome

    rows.push({
      match_no: m.match_no,
      home_team: home,
      away_team: away,
      home_score: finalHome,
      away_score: finalAway,
      went_to_penalties: f.wentToPens,
      pen_home_score: penHome,
      pen_away_score: penAway,
      advancing_team: homeWon ? home : away,
    })
  }

  const unmatched = fd.filter((f) => !matched.has(f))
  return { rows, unmatched }
}
