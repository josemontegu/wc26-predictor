// Optional autonomous fixture sync — run by the GitHub Action (or `npm run sync`).
// Pulls knockout matchups/kick-offs from openfootball and upserts into Supabase
// using the service-role key (server-side only — NEVER ship this key to the client).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional LOCK_MINUTES (default 60).

import { createClient } from '@supabase/supabase-js'
import { buildUpserts, fetchFeed } from '../src/lib/openfootball'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const lockMins = Number(process.env.LOCK_MINUTES ?? '60')

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
    .select('match_no, home_team, away_team, kickoff_time, lock_time')
  if (readErr) throw new Error(readErr.message)

  const { rows, summary } = buildUpserts(existing ?? [], feed, lockMins)

  if (rows.length === 0) {
    console.log('Nothing to update — bracket already in sync.')
    return
  }

  const { error: writeErr } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'match_no' })
  if (writeErr) throw new Error(writeErr.message)

  console.log(
    `Synced: ${summary.matchupsUpdated} matchups, ${summary.kickoffsUpdated} kick-offs, ` +
      `${summary.resolvedTeams} newly confirmed teams.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
