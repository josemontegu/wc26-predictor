-- =============================================================================
-- ⚡ Bullets — special yes/no "prop" predictions on a specific high-stake match.
--
-- Rules (v1):
--   • Flat +N points for a correct call, 0 otherwise (never × round multiplier).
--   • A bullet only COUNTS if every OFFICIAL player who predicted the match also
--     answered the bullet before kick-off. Otherwise it is void for everyone.
--     This is derived (no cron): it becomes final the moment the match locks.
--   • Picks lock with the match; everyone's are revealed afterwards.
--
-- Safe to re-run. Run AFTER 0015.
-- =============================================================================

-- ---- tables ----------------------------------------------------------------
create table if not exists public.bullets (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  question_en text not null,
  question_es text not null,
  emoji       text not null default '⚡',
  points      int  not null default 3,
  answer      boolean,                        -- null until the admin resolves it
  created_at  timestamptz not null default now()
);
create index if not exists bullets_match_idx on public.bullets(match_id);

create table if not exists public.bullet_picks (
  bullet_id  uuid not null references public.bullets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  choice     boolean not null,               -- true = Yes, false = No
  created_at timestamptz not null default now(),
  primary key (bullet_id, user_id)
);
create index if not exists bullet_picks_user_idx on public.bullet_picks(user_id);

-- ---- helper: is the bullet's match still open? ------------------------------
create or replace function public.bullet_match_open(b_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select public.match_is_open((select match_id from public.bullets where id = b_id));
$$;

-- ---- RLS -------------------------------------------------------------------
alter table public.bullets enable row level security;
alter table public.bullet_picks enable row level security;

drop policy if exists bullets_select on public.bullets;
create policy bullets_select on public.bullets
  for select using (auth.uid() is not null);

drop policy if exists bullets_write on public.bullets;
create policy bullets_write on public.bullets
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists bullet_picks_select_own on public.bullet_picks;
create policy bullet_picks_select_own on public.bullet_picks
  for select using (auth.uid() = user_id);

drop policy if exists bullet_picks_insert_own on public.bullet_picks;
create policy bullet_picks_insert_own on public.bullet_picks
  for insert with check (auth.uid() = user_id and public.bullet_match_open(bullet_id));

drop policy if exists bullet_picks_update_own on public.bullet_picks;
create policy bullet_picks_update_own on public.bullet_picks
  for update using (auth.uid() = user_id and public.bullet_match_open(bullet_id))
  with check (auth.uid() = user_id and public.bullet_match_open(bullet_id));

drop policy if exists bullet_picks_delete_own on public.bullet_picks;
create policy bullet_picks_delete_own on public.bullet_picks
  for delete using (auth.uid() = user_id and public.bullet_match_open(bullet_id));

-- ---- participation: who's required, and have they answered? -----------------
-- Required set = OFFICIAL players who predicted the match. Exposes only whether
-- each has answered (never their choice), so it's safe to read before lock — it
-- powers the "waiting on…" tracker and the void rule. Views run as owner and so
-- bypass row-level security; this one deliberately reveals only names + a flag.
create or replace view public.bullet_participation as
select
  b.id                            as bullet_id,
  pr.id                           as user_id,
  pr.nickname,
  pr.emoji,
  (bp.user_id is not null)        as answered
from public.bullets b
join public.predictions pred on pred.match_id = b.match_id
join public.profiles pr      on pr.id = pred.user_id and pr.official = true
left join public.bullet_picks bp on bp.bullet_id = b.id and bp.user_id = pred.user_id;

grant select on public.bullet_participation to authenticated;

-- ---- validity: locked? and is everyone in? ---------------------------------
create or replace view public.bullet_validity as
select
  b.id as bullet_id,
  (m.lock_time is not null and now() >= m.lock_time) as locked,
  not exists (
    select 1 from public.bullet_participation p
    where p.bullet_id = b.id and p.answered = false
  ) as everyone_in
from public.bullets b
join public.matches m on m.id = b.match_id;

grant select on public.bullet_validity to authenticated;

-- ---- reveal: everyone's picks, only once the match has locked ---------------
create or replace view public.locked_bullet_picks as
select
  bp.bullet_id,
  bp.user_id,
  pr.nickname,
  pr.display_name,
  pr.emoji,
  bp.choice
from public.bullet_picks bp
join public.bullets b   on b.id = bp.bullet_id
join public.matches m   on m.id = b.match_id
join public.profiles pr on pr.id = bp.user_id
where m.lock_time is not null and now() >= m.lock_time;

grant select on public.locked_bullet_picks to authenticated;

-- ---- realtime: reflect new/changed picks live ------------------------------
alter publication supabase_realtime add table public.bullets;
alter publication supabase_realtime add table public.bullet_picks;

-- ---- leaderboard: fold in bullet points ------------------------------------
-- Reproduces 0013 and adds a bullet_pts CTE. A bullet only pays out when it is
-- locked, everyone required was in, the answer is set, and the pick matches.
create or replace view public.leaderboard as
with match_pts as (
  select
    user_id,
    sum(total_points)            as pts,
    count(prediction_id)         as scored,
    sum((pts_advance > 0)::int)  as adv,
    sum((pts_exact > 0)::int)    as exact
  from public.prediction_totals
  group by user_id
),
award_pts as (
  select
    ap.user_id,
    sum(case when a.winner is not null
              and lower(btrim(ap.pick)) = lower(btrim(a.winner))
             then a.points else 0 end) as pts
  from public.award_predictions ap
  join public.awards a on a.id = ap.award_id
  group by ap.user_id
),
bullet_pts as (
  select
    bp.user_id,
    sum(b.points) as pts
  from public.bullet_picks bp
  join public.bullets b        on b.id = bp.bullet_id
  join public.bullet_validity v on v.bullet_id = b.id
  where b.answer is not null
    and v.locked = true
    and v.everyone_in = true
    and bp.choice = b.answer
  group by bp.user_id
)
select
  pr.id                                                        as user_id,
  pr.display_name,
  pr.nickname,
  coalesce(mp.pts, 0) + coalesce(awp.pts, 0) + coalesce(bwp.pts, 0) as total_points,
  coalesce(mp.scored, 0)                                       as scored_predictions,
  coalesce(mp.adv, 0)                                          as correct_advances,
  coalesce(mp.exact, 0)                                        as exact_scores,
  pr.emoji
from public.profiles pr
left join match_pts mp   on mp.user_id = pr.id
left join award_pts awp  on awp.user_id = pr.id
left join bullet_pts bwp on bwp.user_id = pr.id
order by total_points desc, exact_scores desc, correct_advances desc, pr.display_name asc;

grant select on public.leaderboard to authenticated;

-- ---- seed today's bullet: Spain v Portugal, "Will Ronaldo score?" ----------
-- Finds the not-yet-played Spain/Portugal match automatically. Remove if you'd
-- rather create it from the Admin panel.
insert into public.bullets (match_id, question_en, question_es, emoji, points)
select id, 'Will Cristiano Ronaldo score?', '¿Cristiano Ronaldo marcará?', '⚽', 3
from public.matches
where 'Portugal' in (home_team, away_team)
  and 'Spain' in (home_team, away_team)
  and home_score is null
  and not exists (select 1 from public.bullets x where x.match_id = matches.id)
limit 1;
