import type { AppConfig, LeaderboardRow, Match, MyScore, Prediction, Profile } from './types'
import {
  DEMO_EMAIL,
  DEMO_USER_ID,
  demoAwardPredictions,
  demoAwards,
  demoConfig,
  demoMatches,
  demoOtherPredictions,
  demoPredictions,
  demoProfiles,
  demoRounds,
} from './demoData'

// A tiny in-memory stand-in for the Supabase client. It implements just the
// chainable query surface the app uses (.from().select().eq().order().single()
// / .update() / .upsert()), plus a fake always-signed-in auth session. Mutations
// persist for the page session so the demo feels real.

interface Store {
  profiles: Profile[]
  matches: Match[]
  predictions: Prediction[]
  rounds: typeof demoRounds
  app_config: AppConfig[]
  awards: typeof demoAwards
  award_predictions: typeof demoAwardPredictions
}

const store: Store = {
  profiles: structuredClone(demoProfiles),
  matches: structuredClone(demoMatches),
  predictions: structuredClone([...demoPredictions, ...demoOtherPredictions]),
  rounds: structuredClone(demoRounds),
  app_config: [structuredClone(demoConfig)],
  awards: structuredClone(demoAwards),
  award_predictions: structuredClone(demoAwardPredictions),
}

type Filter = { col: string; val: unknown }

function computeScore(p: Prediction, m: Match, cfg: AppConfig, mult: number) {
  const advance =
    m.advancing_team != null && p.advancing_team === m.advancing_team ? cfg.points_advance : 0
  const exact =
    m.home_score != null && m.away_score != null && p.home_score === m.home_score && p.away_score === m.away_score
      ? cfg.points_exact
      : 0
  const tendency =
    m.home_score != null && m.away_score != null && Math.sign(p.home_score - p.away_score) === Math.sign(m.home_score - m.away_score)
      ? cfg.points_tendency
      : 0
  const pens = m.went_to_penalties != null && p.penalties === m.went_to_penalties ? cfg.points_penalties : 0
  const exactAet =
    m.aet_home_score != null &&
    p.aet_home_score != null &&
    p.aet_home_score === m.aet_home_score &&
    p.aet_away_score === m.aet_away_score
      ? cfg.points_exact_aet
      : 0
  return {
    pts_advance: advance * mult,
    pts_exact: exact * mult,
    pts_tendency: tendency * mult,
    pts_penalties: pens * mult,
    pts_exact_aet: exactAet * mult,
  }
}

function hasAnyResult(m: Match) {
  return m.home_score != null || m.advancing_team != null || m.went_to_penalties != null
}

function matchLocked(m: Match) {
  return !!m.lock_time && Date.now() >= new Date(m.lock_time).getTime()
}

// Predictions for matches whose lock time has passed — revealed to everyone.
function lockedPredictions() {
  const rows: any[] = []
  for (const p of store.predictions) {
    const m = store.matches.find((x) => x.id === p.match_id)
    if (!m || !matchLocked(m)) continue
    const pr = store.profiles.find((x) => x.id === p.user_id)
    rows.push({
      match_id: p.match_id,
      user_id: p.user_id,
      nickname: pr?.nickname ?? '',
      display_name: pr?.display_name ?? '',
      emoji: pr?.emoji ?? '',
      home_score: p.home_score,
      away_score: p.away_score,
      advancing_team: p.advancing_team,
      penalties: p.penalties,
    })
  }
  return rows
}

// Minimal realtime: listeners fire whenever matches/predictions mutate.
const changeListeners = new Set<() => void>()
function emitChange() {
  changeListeners.forEach((l) => l())
}

function myScores(): MyScore[] {
  const cfg = store.app_config[0]
  const out: MyScore[] = []
  for (const p of store.predictions) {
    if (p.user_id !== DEMO_USER_ID) continue
    const m = store.matches.find((x) => x.id === p.match_id)
    if (!m || !hasAnyResult(m)) continue
    const mult = store.rounds.find((r) => r.code === m.round)?.multiplier ?? 1
    const s = computeScore(p, m, cfg, mult)
    out.push({
      prediction_id: p.id,
      user_id: p.user_id,
      match_id: p.match_id,
      round: m.round,
      ...s,
      total_points:
        s.pts_advance + s.pts_exact + s.pts_tendency + s.pts_penalties + s.pts_exact_aet,
    })
  }
  return out
}

function leaderboard(): LeaderboardRow[] {
  const cfg = store.app_config[0]
  const rows = store.profiles.map((pr) => {
    let total = 0
    let scored = 0
    let advances = 0
    let exacts = 0
    for (const p of store.predictions.filter((x) => x.user_id === pr.id)) {
      const m = store.matches.find((x) => x.id === p.match_id)
      if (!m || !hasAnyResult(m)) continue
      const mult = store.rounds.find((r) => r.code === m.round)?.multiplier ?? 1
      const s = computeScore(p, m, cfg, mult)
      total += s.pts_advance + s.pts_exact + s.pts_tendency + s.pts_penalties + s.pts_exact_aet
      scored += 1
      if (s.pts_advance > 0) advances += 1
      if (s.pts_exact > 0) exacts += 1
    }
    // Award points (winner entered + pick matches).
    for (const ap of store.award_predictions.filter((x) => x.user_id === pr.id)) {
      const a = store.awards.find((x) => x.id === ap.award_id)
      if (a?.winner && ap.pick.trim().toLowerCase() === a.winner.trim().toLowerCase()) {
        total += a.points
      }
    }
    return {
      user_id: pr.id,
      display_name: pr.display_name,
      nickname: pr.nickname,
      emoji: pr.emoji,
      total_points: total,
      scored_predictions: scored,
      correct_advances: advances,
      exact_scores: exacts,
    }
  })
  rows.sort((a, b) => b.total_points - a.total_points || b.exact_scores - a.exact_scores)
  return rows
}

function tableRows(table: string): any[] {
  switch (table) {
    case 'leaderboard':
      return leaderboard()
    case 'my_scores':
      return myScores()
    case 'locked_predictions':
      return lockedPredictions()
    default:
      return (store as any)[table] ?? []
  }
}

class QueryBuilder<T = any> {
  private op: 'select' | 'update' | 'upsert' | 'delete' = 'select'
  private payload: any = null
  private filters: Filter[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private singleMode: 'single' | 'maybe' | null = null
  private conflictKeys: string[] = ['id']

  constructor(private table: string) {}

  select() {
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending !== false
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val })
    return this
  }
  update(payload: any) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  upsert(payload: any, opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = payload
    if (opts?.onConflict) this.conflictKeys = opts.onConflict.split(',').map((s) => s.trim())
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  maybeSingle() {
    this.singleMode = 'maybe'
    return this
  }

  private match(row: any) {
    return this.filters.every((f) => row[f.col] === f.val)
  }

  private run(): { data: T | T[] | null; error: null } {
    let rows = tableRows(this.table)

    if (this.op === 'update') {
      const targets = (store as any)[this.table].filter((r: any) => this.match(r))
      targets.forEach((r: any) => Object.assign(r, this.payload, { updated_at: new Date().toISOString() }))
      emitChange()
      return this.finish(targets)
    }
    if (this.op === 'upsert') {
      const arr = (store as any)[this.table] as any[]
      // supabase-js accepts a single row or an array of rows.
      const items: any[] = Array.isArray(this.payload) ? this.payload : [this.payload]
      const results = items.map((item) => {
        const existing = arr.find((r) => this.conflictKeys.every((k) => r[k] === item[k]))
        if (existing) {
          Object.assign(existing, item, { updated_at: new Date().toISOString() })
          return existing
        }
        const created = {
          id: `gen-${Math.round(performance.now())}-${arr.length}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item,
        }
        arr.push(created)
        return created
      })
      emitChange()
      return this.finish(results)
    }
    if (this.op === 'delete') {
      const arr = (store as any)[this.table] as any[]
      const keep = arr.filter((r) => !this.match(r))
      ;(store as any)[this.table] = keep
      return { data: null, error: null }
    }

    // select
    rows = rows.filter((r) => this.match(r))
    if (this.orderCol) {
      const col = this.orderCol
      rows = [...rows].sort((a, b) => {
        const av = a[col]
        const bv = b[col]
        if (av == null) return 1
        if (bv == null) return -1
        return (av > bv ? 1 : av < bv ? -1 : 0) * (this.orderAsc ? 1 : -1)
      })
    }
    return this.finish(rows)
  }

  private finish(rows: any[]): { data: any; error: null } {
    if (this.singleMode) {
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null }
  }

  // Promise-like: `await builder` resolves the query.
  then(onF: (v: any) => any, onR?: (e: any) => any) {
    try {
      return Promise.resolve(this.run()).then(onF, onR)
    } catch (e) {
      return Promise.reject(e).then(onF, onR)
    }
  }

  // single() returns a resolved result directly (mirrors supabase-js).
  single() {
    this.singleMode = 'single'
    return Promise.resolve(this.run())
  }
}

const demoSession = {
  user: { id: DEMO_USER_ID, email: DEMO_EMAIL },
  access_token: 'demo',
  refresh_token: 'demo',
} as any

export function createDemoClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: demoSession }, error: null }
      },
      onAuthStateChange(_cb: unknown) {
        return { data: { subscription: { unsubscribe() {} } } }
      },
      async signInWithOtp() {
        return { data: {}, error: null }
      },
      async signOut() {
        return { error: null }
      },
    },
    from(table: string) {
      return new QueryBuilder(table)
    },
    // Realtime stand-in: any .on(...) callback fires when demo data mutates.
    channel(_name: string) {
      const cbs: Array<(payload: unknown) => void> = []
      let listener: (() => void) | null = null
      const ch = {
        on(_event: string, _filter: unknown, cb: (payload: unknown) => void) {
          cbs.push(cb)
          return ch
        },
        subscribe(cb?: (status: string) => void) {
          listener = () => cbs.forEach((c) => c({ demo: true }))
          changeListeners.add(listener)
          cb?.('SUBSCRIBED')
          return ch
        },
        _teardown() {
          if (listener) changeListeners.delete(listener)
        },
      }
      return ch
    },
    removeChannel(ch: { _teardown?: () => void }) {
      ch?._teardown?.()
    },
  }
}
