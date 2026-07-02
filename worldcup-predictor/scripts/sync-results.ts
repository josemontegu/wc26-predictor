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
import { buildResultUpsertsFromFd, fetchFootballData } from '../src/lib/footballdata'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const fdToken = process.env.FOOTBALL_DATA_TOKEN
const overwrite = process.env.RESULTS_OVERWRITE === 'true'

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

/**
 * Get the result-update rows. When a football-data.org token is configured we
 * use that live feed (near-instant, with penalty tallies); otherwise we fall
 * back to the openfootball dataset. Either way, writing is fill-only unless
 * RESULTS_OVERWRITE is set.
 */
async function computeRows(): Promise<MatchResultRow[]> {
  if (fdToken) {
    const fd = await fetchFootballData(fdToken)
    console.log(`Fetched ${fd.length} finished knockout match(es) from football-data.org.`)
    const { data: existing, error } = await supabase
      .from('matches')
      .select('match_no, round, home_team, away_team, home_score, away_score')
      .gte('match_no', 73)
    if (error) throw new Error(error.message)
    const { rows, unmatched } = buildResultUpsertsFromFd(existing ?? [], fd, { overwrite })
    for (const u of unmatched) {
      console.warn(
        `Unmatched (no DB row): ${u.homeName} [${u.homeTla}] vs ${u.awayName} [${u.awayTla}] ` +
          `(${u.round}) — check TEAM_TLA / team-name spelling.`,
      )
    }
    return rows
  }

  const feed = await fetchFeed()
  console.log(`Fetched ${feed.length} knockout fixtures from openfootball.`)
  const { data: existing, error } = await supabase
    .from('matches')
    .select('match_no, home_score, away_score')
  if (error) throw new Error(error.message)
  return buildResultUpserts(existing ?? [], feed, { overwrite })
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
