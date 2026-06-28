# ⚽ Polla LDF

A private, mobile-first web app for a **World Cup 2026 knockout-stage prediction pool**
("polla") among friends. Predict the Round of 32 through the Final, lock in your calls before
kick-off, and climb an automatically-scored leaderboard.

Built with **React + Vite + TypeScript** on the front end and **Supabase**
(Postgres + Auth + Row Level Security) on the back end. Deploys for free to **GitHub Pages**.

---

## Features

- **Email magic-link sign-in** (Supabase Auth) — no passwords to manage.
- **Profiles** with a unique nickname and a unique emoji avatar (picked from a grid; taken ones are greyed out). Each player sets these **once**; afterwards only an admin can change them (enforced by a DB trigger, not just the UI), via an admin "Players" editor.
- **Predictions** per match: the final home/away score (after extra time), with the team advancing and penalties **derived** from it.
- **Self-service editing** until a configurable lock time before kick-off; **read-only** after.
- **Admin panel**: create/edit fixtures, set kick-off & lock times, enter results, pick the team that advanced, and tune scoring.
- **Automatic leaderboard** computed in the database from configurable scoring rules.
- **Stats page** — Pool Pulse (the group's consensus champion/award picks, penalty-o-meter, expected goals), per-player breakdown (accuracy + points by category), and figures (points distribution, predicted-vs-actual goals).
- **Rules page** that reads live scoring config so it's always accurate.
- **Row Level Security** so users only touch their own predictions; admins manage everything else.
- **Dark mode** with a header toggle (remembers your choice, respects system preference).
- **"See everyone's picks"** — once a match locks, every player's prediction is revealed.
- **Live leaderboard** — updates in real time (Supabase Realtime) as results are entered, with rank-movement arrows since your last visit.
- **Knockout bracket view** — a swipeable column-per-round tree showing the path to the Final.
- **Delight**: confetti when you nail a perfect prediction, team kit-colour accents on cards and match headers.
- **Tournament award picks** — Champion (the winner), Golden Ball / Boot / Glove. Players are chosen from the official squad lists via a searchable, flag-rich picker (Golden Glove is goalkeepers-only); locked before kick-off and scored into the leaderboard.

## Scoring (defaults — all configurable in Admin)

Each match awards, independently:

| Points | For |
| ------ | --- |
| 2 | Correct result (home win / draw / away win) |
| +4 | Exact final score (stacks on the result → 6 in all) |
| 4 | Correct team advancing |

These components **stack**, so a flawless match (exact score + right team
through) is worth **10** before the round multiplier.

Predictions capture a single **final score** — after extra time, if the match
goes there. Penalties and who advances are then **derived** from it (a level
final score ⇒ a shootout, and you pick the shootout winner), so a prediction can
never contradict itself.

The match total is then multiplied by a **round multiplier** (later rounds are worth more):
R32 ×1, R16 ×2, QF ×3, SF ×4, Third place ×2, Final ×5.

---

## Try it instantly (demo mode)

Want to see the whole app with sample data and **no setup**? Append `?demo` to the
URL — locally (`http://localhost:5173/?demo`) or on your deployed site
(`https://YOURNAME.github.io/REPO/?demo`). Demo mode runs entirely in the browser
with mock matches, results, predictions and a populated leaderboard — no Supabase,
no sign-in. It's perfect for showing friends the game before going live. A **DEMO**
badge in the header makes it obvious you're in the sandbox.

## Live bracket auto-fill (openfootball)

You don't have to type in every knockout matchup. The app can pull them from the
free, public-domain **[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)**
dataset (no API key, CORS-open). As the group stage finishes, bracket slots like
`2A vs 2B` resolve to real nations, and a sync brings them in — the BBC-style
"fills itself in live" behaviour, on a source built for reuse.

Two ways to run it, pick either or both:

1. **From the Admin panel (no setup).** Just open **Admin** — it **auto-syncs the
   bracket every time the page loads** (live mode), fetching the feed in the
   browser and upserting matchups + kick-off times via your admin session (RLS
   allows admin writes). There's also a **Sync again** button to refresh on
   demand. Combined with the live leaderboard, everyone's bracket updates in real
   time. Only changed rows are written, so re-opening when nothing has changed is
   a no-op.
2. **Hands-off on a schedule (optional).** The included
   [`.github/workflows/sync-fixtures.yml`](../.github/workflows/sync-fixtures.yml)
   runs `npm run sync` hourly. Add two repo secrets — `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (the service key is **server-side only**, never in
   the client). Delete the workflow file if you only want the manual button.

**Scope on purpose:** the sync only fills **matchups and kick-off times**, never
scores. openfootball's full-time score can't distinguish a 90-minute result from
one after extra time and carries no penalty data, so **results stay
admin-entered** to keep the 90-minute scoring rules correct.

## Setup

> **Going live?** Follow [`LAUNCH.md`](LAUNCH.md) — a 15-minute, step-by-step
> go-live checklist. The fastest path is to paste [`supabase/setup.sql`](supabase/setup.sql)
> (all migrations + seed in one file) into the Supabase SQL editor. The
> step-by-step below explains the same pieces in more detail.

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. In **SQL Editor**, run these files in order: [`0001_init.sql`](supabase/migrations/0001_init.sql), [`0002_features.sql`](supabase/migrations/0002_features.sql) (reveal-picks view + Realtime), [`0003_consistency.sql`](supabase/migrations/0003_consistency.sql) (outcome constraints), [`0004_extra_time.sql`](supabase/migrations/0004_extra_time.sql) (two-score model + extra-time bonus), [`0005_awards.sql`](supabase/migrations/0005_awards.sql) (tournament award picks), [`0006_champion_squads.sql`](supabase/migrations/0006_champion_squads.sql) (Champion pick + award kinds), [`0007_unique_nickname.sql`](supabase/migrations/0007_unique_nickname.sql) (unique nicknames), [`0008_profile_emoji.sql`](supabase/migrations/0008_profile_emoji.sql) (unique emoji avatars), [`0009_identity_lock.sql`](supabase/migrations/0009_identity_lock.sql) (set-once nickname/emoji, admin override), [`0010_stats.sql`](supabase/migrations/0010_stats.sql) (stats views), [`0011_single_score.sql`](supabase/migrations/0011_single_score.sql) (single final-score model), then [`supabase/seed.sql`](supabase/seed.sql).
3. In **Authentication → Providers → Email**, make sure **Email** is enabled. Magic links work out of the box on the free tier.
   - The live leaderboard uses **Realtime**; `0002_features.sql` already adds the `matches` and `predictions` tables to the `supabase_realtime` publication, so no extra clicks are needed.
4. In **Authentication → URL Configuration**, add your local URL (`http://localhost:5173`) and your GitHub Pages URL (e.g. `https://YOURNAME.github.io/REPO/`) to the **Redirect URLs** allow-list.
5. Grab your project **URL** and **anon public key** from **Project Settings → API**.

### 2. Make yourself an admin

After signing in once (so your profile row exists), run this in the SQL Editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

### 3. Run locally

```bash
cd worldcup-predictor
cp .env.example .env      # then fill in your Supabase URL + anon key
npm install
npm run dev
```

Open http://localhost:5173.

### 4. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. In **Settings → Secrets and variables → Actions**, add two repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push to `main` (or run the **Deploy** workflow manually). The included
   [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds `worldcup-predictor/` and publishes it.

The app uses `HashRouter` and a relative asset base, so it works at any
`https://user.github.io/repo/` path with no extra config.

---

## How the pieces fit

| Concern | Where |
| --- | --- |
| Tables, functions, RLS, scoring views | `supabase/migrations/0001_init.sql` |
| Rounds, default config, 32 fixtures | `supabase/seed.sql` |
| Auth/session state | `src/context/AuthContext.tsx` |
| Routing & profile gate | `src/App.tsx` |
| Player screens | `src/pages/*` |
| Admin screen | `src/pages/AdminPage.tsx`, `src/components/AdminMatchRow.tsx` |

### Security model

- **Predictions**: a user can only `select/insert/update/delete` rows where
  `user_id = auth.uid()`, and only while `match_is_open()` is true (before lock). Enforced in Postgres, not just the UI.
- **Matches / rounds / config**: readable by any signed-in user, writable only when `is_admin()`.
- **Admin escalation**: a trigger prevents non-admins from flipping their own `is_admin` flag.
- **Leaderboard**: a Postgres view aggregates everyone's points without exposing individual predictions.

## Extending later

- Swap manual result entry for a sports API by writing into the same `matches` columns.
- Add group-stage matches by inserting new `rounds` + `matches`.
- Link bracket positions (`feeds_into`) on matches to draw true connector lines between rounds.
