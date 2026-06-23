// Pulls knockout fixtures from the free, public-domain openfootball dataset and
// maps them onto our `matches` rows. Used both client-side (admin "Sync" button)
// and by the optional scheduled GitHub Action (scripts/sync.ts).
//
// Source: https://github.com/openfootball/worldcup.json  (no API key, CORS-open)
// We only sync MATCHUPS + KICKOFF TIMES — never scores. openfootball's `ft`
// can't distinguish a 90-minute score from one after extra time, and carries no
// penalty data, so results remain admin-entered to keep scoring correct.

import type { Match, RoundCode } from './types'

export const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

const ROUND_MAP: Record<string, RoundCode> = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarter-final': 'QF',
  'Quarter-finals': 'QF',
  'Semi-final': 'SF',
  'Semi-finals': 'SF',
  'Match for third place': 'TP',
  'Third place play-off': 'TP',
  'Third-place play-off': 'TP',
  Final: 'F',
}

interface RawMatch {
  num?: number
  round?: string
  date?: string
  time?: string
  team1?: string
  team2?: string
}

export interface FeedFixture {
  match_no: number
  round: RoundCode
  team1: string | null
  team2: string | null
  kickoff_time: string | null
}

export interface UpsertRow {
  match_no: number
  round: RoundCode
  home_team: string
  away_team: string
  kickoff_time: string | null
  lock_time: string | null
}

export interface SyncSummary {
  total: number
  matchupsUpdated: number
  kickoffsUpdated: number
  resolvedTeams: number // placeholders that became real nations
}

/** A real nation name, as opposed to a bracket placeholder like "2A" or "3A/B/C/D/F". */
export function isRealTeam(name?: string | null): boolean {
  if (!name) return false
  const s = name.trim()
  if (!s || s === 'TBD') return false
  return !/[0-9]/.test(s) && !s.includes('/')
}

/** "2026-06-29" + "16:30 UTC-4" -> ISO instant. Returns null if unparseable. */
export function parseKickoff(date?: string, time?: string): string | null {
  if (!date) return null
  if (!time) return null
  const m = time.match(/^(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})?/i)
  if (!m) return null
  const hh = m[1].padStart(2, '0')
  const mm = m[2]
  let offset = 'Z'
  if (m[3]) {
    const sign = m[3][0]
    const hrs = m[3].slice(1).padStart(2, '0')
    offset = `${sign}${hrs}:00`
  }
  const iso = `${date}T${hh}:${mm}:00${offset}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Parse raw openfootball JSON into our knockout fixtures. */
export function parseFeed(raw: unknown): FeedFixture[] {
  const matches = (raw as { matches?: RawMatch[] })?.matches ?? []
  const out: FeedFixture[] = []
  for (const m of matches) {
    const round = m.round ? ROUND_MAP[m.round] : undefined
    if (!round || m.num == null) continue
    out.push({
      match_no: m.num,
      round,
      team1: m.team1 ?? null,
      team2: m.team2 ?? null,
      kickoff_time: parseKickoff(m.date, m.time),
    })
  }
  return out
}

export async function fetchFeed(): Promise<FeedFixture[]> {
  const res = await fetch(OPENFOOTBALL_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`openfootball fetch failed: ${res.status}`)
  return parseFeed(await res.json())
}

/**
 * Merge feed fixtures onto existing matches. Only fills matchups (when the feed
 * has resolved a real nation) and kickoff/lock times; never touches scores.
 */
export function buildUpserts(
  existing: Pick<Match, 'match_no' | 'home_team' | 'away_team' | 'kickoff_time' | 'lock_time'>[],
  feed: FeedFixture[],
  lockMinutesBefore: number,
): { rows: UpsertRow[]; summary: SyncSummary } {
  const byNo = new Map(existing.map((m) => [m.match_no, m]))
  const rows: UpsertRow[] = []
  const summary: SyncSummary = {
    total: 0,
    matchupsUpdated: 0,
    kickoffsUpdated: 0,
    resolvedTeams: 0,
  }

  for (const f of feed) {
    const cur = byNo.get(f.match_no)
    const oldHome = cur?.home_team ?? 'TBD'
    const oldAway = cur?.away_team ?? 'TBD'

    const newHome = isRealTeam(f.team1) ? f.team1!.trim() : oldHome
    const newAway = isRealTeam(f.team2) ? f.team2!.trim() : oldAway

    const newKickoff = f.kickoff_time ?? cur?.kickoff_time ?? null
    const lock = newKickoff
      ? new Date(new Date(newKickoff).getTime() - lockMinutesBefore * 60000).toISOString()
      : (cur?.lock_time ?? null)

    const homeChanged = newHome !== oldHome
    const awayChanged = newAway !== oldAway
    const kickoffChanged = newKickoff !== (cur?.kickoff_time ?? null)

    if (homeChanged || awayChanged || kickoffChanged) {
      summary.total += 1
      if (homeChanged || awayChanged) summary.matchupsUpdated += 1
      if (kickoffChanged) summary.kickoffsUpdated += 1
      if ((homeChanged && oldHome === 'TBD') || (awayChanged && oldAway === 'TBD'))
        summary.resolvedTeams += 1

      rows.push({
        match_no: f.match_no,
        round: f.round,
        home_team: newHome,
        away_team: newAway,
        kickoff_time: newKickoff,
        lock_time: lock,
      })
    }
  }

  return { rows, summary }
}
