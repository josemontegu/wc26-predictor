// Autonomous RESULTS sync — run by the GitHub Action (or `npm run sync:results`).
// Pulls finished knockout scores from openfootball and writes them into Supabase
// using the service-role key (server-side only — NEVER ship this key to the client).
//
// Fill-only by default: a result that's already entered is never overwritten, so
// manual entries/corrections always win. Set RESULTS_OVERWRITE=true to always
// take the feed's result. Only complete, finished matches are written (the DB
// constraints reject anything inconsistent).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional RESULTS_OVERWRITE.

import { createClient } from '@supabase/supabase-js'
import { buildResultUpserts, fetchFeed, type MatchResultRow } from '../src/lib/openfootball'
import { buildResultUpsertsFromFd } from '../src/lib/footballdata'
import { fetchEspnResults } from '../src/lib/espn'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const overwrite = process.env.RESULTS_OVERWRITE === 'true'
// Bypass the result-window gate and check now (overwrite implies a forced run).
const force = process.env.RESULTS_FORCE === 'true' || overwrite

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// A finished result can appear no sooner than ~90' + stoppage + half-time, and
// no later than 90' + extra time + a shootout + reporting delay. So an unscored
// match is only worth polling for once it's this many minutes past kickoff.
const RESULT_WINDOW_MIN = 90
const RESULT_WINDOW_MAX = 210

type ExistingRow = {
  match_no: number
  round: string
  home_team: string | null
  away_team: string | null
  home_score: number | null
  away_score: number | null
  kickoff_time: string | null
}

/**
 * Get the result-update rows. Primary source is ESPN's live scoreboard
 * (near-instant, keyless, carries the penalty tally); if it's unreachable or
 * empty we fall back to the openfootball dataset. Writing is fill-only unless
 * RESULTS_OVERWRITE is set.
 *
 * Self-gating: the live feed is only hit when an unscored match is actually
 * inside its result window (or on the once-an-hour safety sweep, or when forced),
 * so the 5-minute ping is a ~instant no-op during the many hours no match is
 * ending — tight polling exactly when it matters, idle otherwise.
 */
async function computeRows(): Promise<MatchResultRow[]> {
  // One read serves both paths: ESPN matches by team, openfootball by match_no.
  const { data, error } = await supabase
    .from('matches')
    .select('match_no, round, home_team, away_team, home_score, away_score, kickoff_time')
    .gte('match_no', 73)
  if (error) throw new Error(error.message)
  const existing = (data ?? []) as ExistingRow[]

  if (!force) {
    const now = Date.now()
    const active = existing.filter((m) => {
      if (m.home_score != null || !m.kickoff_time) return false
      const mins = (now - new Date(m.kickoff_time).getTime()) / 60000
      return mins >= RESULT_WINDOW_MIN && mins <= RESULT_WINDOW_MAX
    })
    // Once-an-hour full sweep as a backstop for missing/odd kickoff times or a
    // result that posts unusually late.
    const hourlySweep = new Date().getUTCMinutes() < 5
    if (active.length === 0 && !hourlySweep) {
      console.log('No unscored match in its result window — skipping the live fetch.')
      return []
    }
    if (active.length > 0) {
      console.log(`In result window: match ${active.map((m) => m.match_no).join(', ')}.`)
    }
  }

  try {
    const espn = await fetchEspnResults()
    console.log(`Fetched ${espn.length} finished knockout result(s) from ESPN.`)
    if (espn.length > 0) {
      const { rows, unmatched } = buildResultUpsertsFromFd(existing, espn, { overwrite })
      for (const u of unmatched) {
        console.warn(
          `Unmatched (no DB row): ${u.homeName} [${u.homeTla}] vs ${u.awayName} [${u.awayTla}] ` +
            `— check TEAM_TLA / team-name spelling.`,
        )
      }
      return rows
    }
    console.warn('ESPN returned no finished knockout results; falling back to openfootball.')
  } catch (e) {
    console.warn(`ESPN source failed (${(e as Error).message}); falling back to openfootball.`)
  }

  const feed = await fetchFeed()
  console.log(`Fetched ${feed.length} knockout fixtures from openfootball.`)
  return buildResultUpserts(existing, feed, { overwrite })
}

async function main() {
  const rows = await computeRows()
  if (rows.length === 0) {
    console.log('No new finished results to write.')
    return
  }

  let written = 0
  for (const r of rows) {
    const { match_no, ...fields } = r
    const { data, error } = await supabase
      .from('matches')
      .update(fields)
      .eq('match_no', match_no)
      .select('match_no')
    if (error) {
      console.error(`Match ${match_no}: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      console.error(
        `Match ${match_no}: update changed 0 rows — the key is likely not the ` +
          `service_role/secret key, so RLS blocked the write. Check SUPABASE_SERVICE_ROLE_KEY.`,
      )
      continue
    }
    written++
    const pens = fields.went_to_penalties
      ? ` (pens ${fields.pen_home_score}-${fields.pen_away_score})`
      : ''
    console.log(
      `Match ${match_no}: ${fields.home_team} ${fields.home_score}-${fields.away_score} ` +
        `${fields.away_team}${pens} → ${fields.advancing_team}`,
    )
  }
  console.log(`Wrote ${written} result(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
