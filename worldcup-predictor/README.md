# Polla LDF

**Polla LDF** is a mobile-first web app for running a **knockout-stage football prediction pool** among a private group. Players predict each match from the Round of 32 through the Final, lock in their calls before kick-off, and climb a leaderboard that scores itself automatically as results come in.

Built with **React + Vite + TypeScript** on the front end and **Supabase** (Postgres, Auth, Row-Level Security, Realtime) on the back end. It ships as a static bundle and deploys to any static host.

> **Status:** private pool, currently in production for a single group. See [Path to launch](#path-to-launch) for what a public/official release still requires.

---

## Table of contents

- [Features](#features)
- [Scoring](#scoring)
- [Try it instantly (demo mode)](#try-it-instantly-demo-mode)
- [Automatic fixtures & results](#automatic-fixtures--results)
- [Setup](#setup)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Legal](#legal)
- [License](#license)
- [Path to launch](#path-to-launch)

## Features

- **Passwordless sign-in** via email magic link (Supabase Auth).
- **Set-once identity** — each player picks a unique nickname and emoji avatar (taken emojis are disabled). Locked after selection; only an admin can change them, enforced by a database trigger.
- **One prediction per match** — a single final score (after extra time). Who advances and whether it went to penalties are **derived** from the score, so a prediction can never contradict itself; a level score prompts you to pick the shootout winner.
- **Self-service editing** until each match locks, with a **live countdown** on the match page; read-only afterwards.
- **Automatic, transparent scoring** computed from configurable rules, with a **live leaderboard** (Realtime) that updates as results land, including rank-movement indicators.
- **Reveal after lock** — once a match locks, everyone's picks (and, after full-time, their points) are shown together.
- **Player cards** — tap any player for their accuracy stats, drilled down by round into the exact games behind each figure.
- **Knockout bracket** — a swipeable round-by-round tree.
- **Tournament awards** — Champion, Golden Ball / Boot / Glove, chosen from official squad lists via a searchable picker, plus a "Pool Pulse" view of the group's consensus.
- **Stats** — points distribution, per-source and per-round breakdowns, pool-wide figures, and playful superlatives.
- **Bilingual** (English / Spanish) throughout, **dark mode**, and accessibility support (keyboard focus, reduced-motion, screen-reader labels).
- **Admin panel** — manage fixtures, kick-off/lock times, results, the advancing team, scoring config, and players (including guest/"unofficial" entrants).

## Scoring

Each match awards, independently:

| Points | For |
| ------ | --- |
| 2 | Correct result (home win / draw / away win) |
| +4 | Exact final score (stacks on the result → 6 in all) |
| 4 | Correct team advancing |

Components **stack**, so a flawless match (exact score + right team through) is worth **10** before the round multiplier. The match total is then multiplied by a **round multiplier** (later rounds are worth more): R32 ×1, R16 ×2, QF ×3, SF ×4, Third place ×2, Final ×5.

All values are configurable in the Admin panel, and the in-app Rules page reads the live config so it is always accurate.

## Try it instantly (demo mode)

Append `?demo` to the URL — locally (`http://localhost:5173/?demo`) or on your deployed site. Demo mode runs entirely in the browser with mock data and no sign-in, so you can show the whole app without any backend. A **DEMO** badge in the header makes the sandbox obvious.

## Automatic fixtures & results

The pool can keep itself up to date without manual entry.

- **Fixtures** resolve from the free, public-domain [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) dataset as the bracket fills in. The Admin panel auto-syncs on load, and [`.github/workflows/sync-fixtures.yml`](.github/workflows/sync-fixtures.yml) can run it on a schedule.
- **Results** are fetched by [`scripts/sync-results.ts`](scripts/sync-results.ts) on a schedule ([`.github/workflows/sync-results.yml`](.github/workflows/sync-results.yml)). The **primary source is ESPN's public scoreboard**, with **openfootball as a fallback**. Writes are **fill-only** by default (a result you've entered or corrected is never overwritten; set `RESULTS_OVERWRITE=true` to change that), and only complete, consistent matches are written.
- **Manual entry always wins** — the Admin panel is the authoritative override, and the leaderboard/stats recompute instantly.

> Scheduled syncs use two GitHub Actions secrets — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The **service-role key is server-side only** and must never appear in the client bundle or in `VITE_*` variables.

## Setup

> **Going live?** [`LAUNCH.md`](LAUNCH.md) is a step-by-step go-live checklist. The fastest database path is to paste [`supabase/setup.sql`](supabase/setup.sql) (all migrations + seed in one file) into the Supabase SQL editor.

1. **Create a Supabase project** (free tier is fine). In the SQL Editor, run [`supabase/setup.sql`](supabase/setup.sql), or the numbered files in [`supabase/migrations/`](supabase/migrations/) in order followed by [`supabase/seed.sql`](supabase/seed.sql).
2. **Enable email auth** (Authentication → Providers → Email) and add your local (`http://localhost:5173`) and production URLs to the **Redirect URLs** allow-list.
3. **Make yourself admin** after signing in once:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. **Run locally:**
   ```bash
   cd worldcup-predictor
   cp .env.example .env      # fill in your Supabase URL + anon (publishable) key
   npm install
   npm run dev
   ```
5. **Deploy.** The included [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes to GitHub Pages on push to `main`; add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets. The app uses `HashRouter` and a relative asset base, so it works at any sub-path (and on other static hosts).

Only the **anon/publishable** Supabase key belongs in the client. Keep the service-role/secret key out of the repo and out of `VITE_*` entirely.

## Architecture

| Concern | Where |
| --- | --- |
| Tables, functions, RLS, scoring views | [`supabase/migrations/`](supabase/migrations/) |
| Rounds, default config, seed fixtures | [`supabase/seed.sql`](supabase/seed.sql) |
| Auth/session state | `src/context/AuthContext.tsx` |
| Routing & profile gate | `src/App.tsx` |
| Player screens | `src/pages/*` |
| Admin screen | `src/pages/AdminPage.tsx`, `src/components/Admin*.tsx` |
| Results / fixtures sync | `scripts/*`, `src/lib/espn.ts`, `src/lib/openfootball.ts` |

## Security model

- **Predictions:** a user can only read/write rows where `user_id = auth.uid()`, and only before the match locks — enforced in Postgres, not just the UI. Other players' picks are hidden until the match locks.
- **Matches / rounds / config:** readable by any signed-in user, writable only by admins.
- **Admin escalation:** a trigger prevents non-admins from granting themselves admin (or flipping the guest/official flag).
- **Leaderboard & stats:** Postgres views aggregate points without exposing anyone's individual predictions.

## Legal

The app includes template **Terms of Service** and **Privacy Policy** pages (English/Spanish), reachable at `/#/terms` and `/#/privacy` and linked from the sign-in and Rules screens. See [`src/pages/LegalPage.tsx`](src/pages/LegalPage.tsx).

> ⚠️ These are **drafts for review, not legal advice.** Before any public or official launch, have a qualified professional review them and complete the bracketed placeholders (`[OPERATOR]`, `[CONTACT EMAIL]`, `[JURISDICTION]`, `[AGE]`). This project is **not affiliated with, endorsed by, or sponsored by FIFA or the FIFA World Cup**; all trademarks belong to their respective owners.

## License

Proprietary — all rights reserved. See [`LICENSE`](LICENSE). Viewing this repository grants no rights to use, copy, or distribute the software. (If you decide to open-source it later, replace `LICENSE` with a standard permissive license such as MIT.)

## Path to launch

This is a strong single-group app, not yet a multi-tenant product. Before an official release, the main gaps are:

- **Legal & brand:** finalise the Terms/Privacy templates; choose a launch-safe, tournament-agnostic name and a custom domain.
- **Reliability:** add error monitoring and privacy-respecting analytics, a CI quality gate (typecheck, lint, tests for the scoring math and results sync), and atomic deploys with rollback.
- **Results resilience:** health-check and alert the sync pipeline; keep manual entry as the documented fallback.
- **Multi-tenancy (only if productising):** pools as first-class, isolated entities with self-serve creation, invites, and per-pool roles.
