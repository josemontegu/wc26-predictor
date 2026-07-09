// Live RESULTS source: ESPN's public scoreboard API. Free, no API key, CORS-open,
// and near-instant: a finished knockout match shows up within seconds of full
// time, with the score, extra-time / penalty status, the shootout tally, and a
// winner flag. This is the primary results source; openfootball is the fallback.
//
// Endpoint: site.api.espn.com/.../soccer/fifa.world/scoreboard
//   - bare call returns the tournament's *current* day (ESPN's clock tracks the
//     event, so we don't depend on the CI runner's real date)
//   - ?dates=YYYYMMDD returns a specific day
// We pull the current day plus the two before it, so a match that finished late
// (around tournament-midnight) is never missed. Fill-only downstream.
//
// Results are shaped as `FdKnockout` and handed to the shared matcher in
// ./footballdata, which maps them onto our match_no by FIFA code / team name.

import type { FdKnockout } from './footballdata'

const ESPN_SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'

// Knockout stages, keyed by ESPN's season "type"/"slug" wording. Used only to
// skip group games. ESPN doesn't always label the round on the scoreboard, so
// matching is by team pair; this filter just avoids group-stage noise.
const GROUP_HINT = /group/i

interface EspnTeam {
  abbreviation?: string
  displayName?: string
  name?: string
  location?: string
}
interface EspnCompetitor {
  homeAway?: string
  winner?: boolean
  score?: string | number
  shootoutScore?: string | number | null
  team?: EspnTeam
}
interface EspnStatusType {
  completed?: boolean
  name?: string
}
interface EspnEvent {
  status?: { type?: EspnStatusType }
  season?: { slug?: string }
  competitions?: {
    notes?: { headline?: string }[]
    status?: { type?: EspnStatusType }
    competitors?: EspnCompetitor[]
  }[]
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** Parse one ESPN scoreboard payload into finished knockout results. */
export function parseEspn(raw: unknown): FdKnockout[] {
  const events = (raw as { events?: EspnEvent[] })?.events ?? []
  const out: FdKnockout[] = []
  for (const e of events) {
    const comp = e.competitions?.[0]
    const status = comp?.status?.type ?? e.status?.type
    if (!status?.completed) continue // not finished yet

    // Skip group-stage games (headline or season slug mentions "group").
    const headline = comp?.notes?.[0]?.headline || e.season?.slug || ''
    if (GROUP_HINT.test(headline)) continue

    const cs = comp?.competitors ?? []
    const homeC = cs.find((c) => c.homeAway === 'home') ?? cs[0]
    const awayC = cs.find((c) => c.homeAway === 'away') ?? cs[1]
    if (!homeC || !awayC) continue

    const finalHome = num(homeC.score)
    const finalAway = num(awayC.score)
    if (finalHome == null || finalAway == null) continue

    const penHome = num(homeC.shootoutScore)
    const penAway = num(awayC.shootoutScore)
    const wentToPens =
      /PEN/i.test(status.name || '') || (penHome != null && penAway != null)

    out.push({
      round: '' as FdKnockout['round'], // matched by team pair, not round
      homeName: (homeC.team?.displayName || homeC.team?.name || homeC.team?.location || '').trim(),
      awayName: (awayC.team?.displayName || awayC.team?.name || awayC.team?.location || '').trim(),
      homeTla: (homeC.team?.abbreviation || '').toUpperCase(),
      awayTla: (awayC.team?.abbreviation || '').toUpperCase(),
      finalHome,
      finalAway,
      wentToPens,
      penHome: wentToPens ? penHome : null,
      penAway: wentToPens ? penAway : null,
      winnerIsHome: homeC.winner === true ? true : awayC.winner === true ? false : finalHome > finalAway,
    })
  }
  return out
}

async function fetchDay(dateParam?: string): Promise<{ raw: unknown; day: string | null }> {
  const urlStr = dateParam ? `${ESPN_SCOREBOARD}?dates=${dateParam}` : ESPN_SCOREBOARD
  const res = await fetch(urlStr, { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN fetch failed: ${res.status} ${res.statusText}`)
  const raw = await res.json()
  const day = (raw as { day?: { date?: string } })?.day?.date ?? null
  return { raw, day }
}

/** "2026-07-02" minus n days → "YYYYMMDD". */
function shiftDate(isoDate: string, minusDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - minusDays)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Finished knockout results from ESPN: the tournament's current day plus the two
 * prior days (anchored to ESPN's own clock, so it's independent of the CI date).
 */
export async function fetchEspnResults(): Promise<FdKnockout[]> {
  const today = await fetchDay()
  const results: FdKnockout[] = [...parseEspn(today.raw)]

  if (today.day) {
    for (const back of [1, 2]) {
      try {
        const prev = await fetchDay(shiftDate(today.day, back))
        results.push(...parseEspn(prev.raw))
      } catch {
        // a single day failing shouldn't sink the sync
      }
    }
  }

  // De-dupe by team pair (a day can appear in more than one window).
  const seen = new Set<string>()
  return results.filter((r) => {
    const key = [r.homeTla || r.homeName, r.awayTla || r.awayName].sort().join('~')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
