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
import { buildResultUpserts, fetchFeed } from '../src/lib/openfootball'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const overwrite = process.env.RESULTS_OVERWRITE === 'true'

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const feed = await fetchFeed()
  console.log(`Fetched ${feed.length} knockout fixtures from openfootball.`)

  const { data: existing, error: readErr } = await supabase
    .from('matches')
    .select('match_no, home_score, away_score')
  if (readErr) throw new Error(readErr.message)

  const rows = buildResultUpserts(existing ?? [], feed, { overwrite })
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
