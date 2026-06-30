-- =============================================================================
-- Polla LDF — COMPLETE DATABASE SETUP (paste this whole file once into the
-- Supabase SQL Editor and Run). It is all the migrations 0001–0013 + seed,
-- in order. Safe to re-run.
-- =============================================================================


-- ▼▼▼ 0001_init.sql ▼▼▼
-- =============================================================================
-- World Cup 2026 Knockout Predictor — full schema, security and scoring.
-- Paste this whole file into the Supabase SQL editor (or run via the CLI) once.
-- Idempotent-ish: safe to re-run; uses "if not exists" / "or replace" widely.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reference data: knockout rounds (with per-round scoring multipliers)
-- ----------------------------------------------------------------------------
create table if not exists public.rounds (
  code        text primary key,            -- 'R32','R16','QF','SF','TP','F'
  name        text not null,
  sort_order  int  not null,
  multiplier  numeric not null default 1   -- later rounds are worth more
);

-- ----------------------------------------------------------------------------
-- 2. Global configuration (single row, id = 1)
-- ----------------------------------------------------------------------------
create table if not exists public.app_config (
  id                          int primary key default 1,
  points_advance              int not null default 4,   -- correct advancing team
  points_exact                int not null default 4,   -- exact final score (stacks on the result)
  points_tendency             int not null default 2,   -- correct result (1/X/2)
  points_penalties            int not null default 0,   -- retired (kept for compatibility)
  lock_minutes_before_kickoff int not null default 1,   -- default lock offset (mins before kick-off)
  constraint app_config_singleton check (id = 1)
);

-- ----------------------------------------------------------------------------
-- 3. Profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  nickname     text not null default '',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Matches
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id                uuid primary key default gen_random_uuid(),
  round             text not null references public.rounds (code),
  match_no          int unique,                   -- FIFA match number (optional)
  home_team         text not null default 'TBD',
  away_team         text not null default 'TBD',
  kickoff_time      timestamptz,                  -- null until scheduled
  lock_time         timestamptz,                  -- predictions close at this time
  home_score        int,                          -- 90' result, null until played
  away_score        int,
  went_to_penalties boolean,                       -- null until result entered
  advancing_team    text,                          -- team that advanced
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists matches_round_idx on public.matches (round);
create index if not exists matches_kickoff_idx on public.matches (kickoff_time);

-- ----------------------------------------------------------------------------
-- 5. Predictions (one per user per match)
-- ----------------------------------------------------------------------------
create table if not exists public.predictions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  match_id       uuid not null references public.matches (id) on delete cascade,
  home_score     int not null,
  away_score     int not null,
  advancing_team text not null,
  penalties      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, match_id),
  check (home_score >= 0 and home_score <= 99),
  check (away_score >= 0 and away_score <= 99)
);

create index if not exists predictions_match_idx on public.predictions (match_id);
create index if not exists predictions_user_idx on public.predictions (user_id);

-- ----------------------------------------------------------------------------
-- 6. Helper functions
-- ----------------------------------------------------------------------------

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists matches_touch on public.matches;
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

drop trigger if exists predictions_touch on public.predictions;
create trigger predictions_touch before update on public.predictions
  for each row execute function public.touch_updated_at();

-- is the current user an admin? (security definer so it bypasses profiles RLS)
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- are predictions still open for a given match? (lock_time in the future)
create or replace function public.match_is_open(m_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce(
    (select lock_time is not null and now() < lock_time
       from public.matches where id = m_id),
    false);
$$;

-- auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, display_name, nickname)
  values (
    new.id,
    coalesce(split_part(new.email, '@', 1), 'Player'),
    coalesce(split_part(new.email, '@', 1), 'Player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- prevent a non-admin from granting themselves admin via a profile update
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin) and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_admin on public.profiles;
create trigger profiles_protect_admin before update on public.profiles
  for each row execute function public.protect_admin_flag();

-- ----------------------------------------------------------------------------
-- 7. Scoring views
-- ----------------------------------------------------------------------------

-- Per-prediction breakdown. Each component is scored independently as soon as
-- the relevant result is entered, then scaled by the round multiplier.
create or replace view public.prediction_scores as
select
  p.id                                   as prediction_id,
  p.user_id,
  p.match_id,
  m.round,
  coalesce(r.multiplier, 1)              as multiplier,
  -- correct advancing team
  (case when m.advancing_team is not null
             and p.advancing_team = m.advancing_team
        then cfg.points_advance else 0 end) * coalesce(r.multiplier, 1)
                                          as pts_advance,
  -- exact 90' score
  (case when m.home_score is not null and m.away_score is not null
             and p.home_score = m.home_score and p.away_score = m.away_score
        then cfg.points_exact else 0 end) * coalesce(r.multiplier, 1)
                                          as pts_exact,
  -- correct 90' tendency (home win / draw / away win)
  (case when m.home_score is not null and m.away_score is not null
             and sign(p.home_score - p.away_score) = sign(m.home_score - m.away_score)
        then cfg.points_tendency else 0 end) * coalesce(r.multiplier, 1)
                                          as pts_tendency,
  -- correct penalties prediction
  (case when m.went_to_penalties is not null
             and p.penalties = m.went_to_penalties
        then cfg.points_penalties else 0 end) * coalesce(r.multiplier, 1)
                                          as pts_penalties
from public.predictions p
join public.matches m on m.id = p.match_id
left join public.rounds r on r.code = m.round
cross join public.app_config cfg
where m.home_score is not null            -- only scored once a result exists
   or m.advancing_team is not null
   or m.went_to_penalties is not null;

-- Per-prediction total points (one number per prediction)
create or replace view public.prediction_totals as
select
  prediction_id,
  user_id,
  match_id,
  round,
  pts_advance,
  pts_exact,
  pts_tendency,
  pts_penalties,
  (pts_advance + pts_exact + pts_tendency + pts_penalties) as total_points
from public.prediction_scores;

-- The current user's own breakdown (safe to expose: filtered to auth.uid()).
create or replace view public.my_scores as
select * from public.prediction_totals where user_id = auth.uid();

-- Aggregate leaderboard across all players. Owned by postgres, so it reads all
-- rows regardless of the caller's RLS — exactly what a shared leaderboard needs.
create or replace view public.leaderboard as
select
  pr.id                                            as user_id,
  pr.display_name,
  pr.nickname,
  coalesce(sum(pt.total_points), 0)                as total_points,
  count(pt.prediction_id)                          as scored_predictions,
  coalesce(sum((pt.pts_advance > 0)::int), 0)      as correct_advances,
  coalesce(sum((pt.pts_exact > 0)::int), 0)        as exact_scores
from public.profiles pr
left join public.prediction_totals pt on pt.user_id = pr.id
group by pr.id, pr.display_name, pr.nickname
order by total_points desc, exact_scores desc, pr.display_name asc;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.matches     enable row level security;
alter table public.predictions enable row level security;
alter table public.rounds      enable row level security;
alter table public.app_config  enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- matches -------------------------------------------------------------------
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
  for select using (auth.uid() is not null);

drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- predictions ---------------------------------------------------------------
drop policy if exists predictions_select_own on public.predictions;
create policy predictions_select_own on public.predictions
  for select using (auth.uid() = user_id);

drop policy if exists predictions_insert_own on public.predictions;
create policy predictions_insert_own on public.predictions
  for insert with check (
    auth.uid() = user_id and public.match_is_open(match_id)
  );

drop policy if exists predictions_update_own on public.predictions;
create policy predictions_update_own on public.predictions
  for update using (auth.uid() = user_id and public.match_is_open(match_id))
  with check (auth.uid() = user_id and public.match_is_open(match_id));

drop policy if exists predictions_delete_own on public.predictions;
create policy predictions_delete_own on public.predictions
  for delete using (auth.uid() = user_id and public.match_is_open(match_id));

-- rounds & config: everyone reads, only admins write ------------------------
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select using (auth.uid() is not null);

drop policy if exists rounds_admin_write on public.rounds;
create policy rounds_admin_write on public.rounds
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
  for select using (auth.uid() is not null);

drop policy if exists app_config_admin_write on public.app_config;
create policy app_config_admin_write on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. Grants on views (RLS does not apply to views; gate by grant instead)
-- ----------------------------------------------------------------------------
revoke all on public.prediction_scores from anon, authenticated;
revoke all on public.prediction_totals from anon, authenticated;
grant select on public.my_scores   to authenticated;
grant select on public.leaderboard to authenticated;
-- ▲▲▲ 0001_init.sql ▲▲▲

-- ▼▼▼ 0002_features.sql ▼▼▼
-- =============================================================================
-- Feature migration: reveal predictions after lock + enable realtime.
-- Run AFTER 0001_init.sql. Safe to re-run.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. "See everyone's picks" — only for matches whose lock time has passed.
--    Owned by postgres, so it bypasses the own-rows-only RLS on predictions,
--    but the WHERE clause guarantees nothing leaks before a match locks.
-- ----------------------------------------------------------------------------
create or replace view public.locked_predictions as
select
  p.match_id,
  p.user_id,
  pr.nickname,
  pr.display_name,
  p.home_score,
  p.away_score,
  p.advancing_team,
  p.penalties
from public.predictions p
join public.profiles pr on pr.id = p.user_id
join public.matches m on m.id = p.match_id
where m.lock_time is not null and now() >= m.lock_time;

grant select on public.locked_predictions to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Realtime: broadcast row changes on matches & predictions so the
--    leaderboard and match pages can live-update. Guarded so re-runs are safe.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.matches;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.predictions;
  exception when duplicate_object then null;
  end;
end $$;
-- ▲▲▲ 0002_features.sql ▲▲▲

-- ▼▼▼ 0003_consistency.sql ▼▼▼
-- =============================================================================
-- Outcome consistency — enforce the rules of knockout football at the data layer
-- so impossible predictions/results can never be stored, even by a buggy or
-- bypassed client:
--   * penalties can only happen when the 90-minute score is LEVEL
--   * a decisive 90-minute score means the WINNER advances
-- Run AFTER 0001_init.sql. If you have existing rows that already violate these,
-- fix them first (these ADD CONSTRAINTs validate immediately).
-- =============================================================================

-- ---- predictions: penalties only on a draw -----------------------------------
alter table public.predictions drop constraint if exists predictions_pens_requires_draw;
alter table public.predictions
  add constraint predictions_pens_requires_draw
  check (penalties = false or home_score = away_score);

-- ---- matches: penalties only on a draw (nulls allowed until result entered) ---
alter table public.matches drop constraint if exists matches_pens_requires_draw;
alter table public.matches
  add constraint matches_pens_requires_draw
  check (
    went_to_penalties is not true
    or home_score is null or away_score is null
    or home_score = away_score
  );

-- ---- matches: a decisive score => advancing team is the winner ----------------
alter table public.matches drop constraint if exists matches_advance_matches_winner;
alter table public.matches
  add constraint matches_advance_matches_winner
  check (
    home_score is null or away_score is null
    or home_score = away_score          -- a draw: advancing is a free choice
    or advancing_team is null
    or advancing_team = case when home_score > away_score then home_team else away_team end
  );

-- ---- predictions: a decisive score => advancing team is the winner ------------
-- Needs the match's team names, so this is a trigger rather than a CHECK.
create or replace function public.validate_prediction_outcome()
returns trigger language plpgsql
set search_path = public as $$
declare
  home_t text;
  away_t text;
  expected text;
begin
  if new.home_score <> new.away_score then
    select home_team, away_team into home_t, away_t from public.matches where id = new.match_id;
    expected := case when new.home_score > new.away_score then home_t else away_t end;
    if new.advancing_team <> expected then
      raise exception
        'Advancing team must be the side winning the 90-minute score (got %, expected %)',
        new.advancing_team, expected;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_validate_outcome on public.predictions;
create trigger predictions_validate_outcome
  before insert or update on public.predictions
  for each row execute function public.validate_prediction_outcome();
-- ▲▲▲ 0003_consistency.sql ▲▲▲

-- ▼▼▼ 0004_extra_time.sql ▼▼▼
-- =============================================================================
-- Two-score model: predict the 90-minute result AND, when level, the score
-- after extra time. Penalties is DERIVED (still level after extra time) rather
-- than entered, so it can never contradict the score. Adds an "exact extra-time
-- score" scoring bonus. Run AFTER 0001–0003. Safe to re-run.
-- =============================================================================

-- ---- new columns -------------------------------------------------------------
alter table public.predictions add column if not exists aet_home_score int;
alter table public.predictions add column if not exists aet_away_score int;
alter table public.matches     add column if not exists aet_home_score int;
alter table public.matches     add column if not exists aet_away_score int;

alter table public.app_config
  add column if not exists points_exact_aet int not null default 3;

-- ---- replace 0003 constraints with extra-time-aware versions ------------------
alter table public.predictions drop constraint if exists predictions_pens_requires_draw;
alter table public.matches     drop constraint if exists matches_pens_requires_draw;
alter table public.matches     drop constraint if exists matches_advance_matches_winner;

-- predictions ------------------------------------------------------------------
-- extra-time score only exists when the 90' score is level
alter table public.predictions drop constraint if exists predictions_aet_only_on_draw;
alter table public.predictions
  add constraint predictions_aet_only_on_draw
  check (home_score = away_score or (aet_home_score is null and aet_away_score is null));

-- goals only accumulate: extra-time score >= 90' score per side
alter table public.predictions drop constraint if exists predictions_aet_ge_reg;
alter table public.predictions
  add constraint predictions_aet_ge_reg
  check (
    (aet_home_score is null or aet_home_score >= home_score)
    and (aet_away_score is null or aet_away_score >= away_score)
  );

-- penalties is exactly "level at 90' AND still level after extra time"
alter table public.predictions drop constraint if exists predictions_pens_derived;
alter table public.predictions
  add constraint predictions_pens_derived
  check (
    penalties =
    (home_score = away_score and aet_home_score is not null and aet_home_score = aet_away_score)
  );

-- matches ----------------------------------------------------------------------
alter table public.matches drop constraint if exists matches_aet_only_on_draw;
alter table public.matches
  add constraint matches_aet_only_on_draw
  check (
    home_score is null or away_score is null
    or home_score = away_score
    or (aet_home_score is null and aet_away_score is null)
  );

alter table public.matches drop constraint if exists matches_aet_ge_reg;
alter table public.matches
  add constraint matches_aet_ge_reg
  check (
    (aet_home_score is null or home_score is null or aet_home_score >= home_score)
    and (aet_away_score is null or away_score is null or aet_away_score >= away_score)
  );

alter table public.matches drop constraint if exists matches_pens_derived;
alter table public.matches
  add constraint matches_pens_derived
  check (
    went_to_penalties is null
    or went_to_penalties =
       (home_score is not null and home_score = away_score
        and aet_home_score is not null and aet_home_score = aet_away_score)
  );

-- advancing team must be the side that wins (in 90' or in extra time);
-- a shootout (still level after extra time) leaves it free.
alter table public.matches drop constraint if exists matches_advance_winner;
alter table public.matches
  add constraint matches_advance_winner
  check (
    home_score is null or away_score is null or advancing_team is null
    or (home_score <> away_score
        and advancing_team = case when home_score > away_score then home_team else away_team end)
    or (home_score = away_score and aet_home_score is not null and aet_home_score <> aet_away_score
        and advancing_team = case when aet_home_score > aet_away_score then home_team else away_team end)
    or (home_score = away_score and (aet_home_score is null or aet_home_score = aet_away_score))
  );

-- ---- prediction advancing trigger (needs the match's team names) -------------
create or replace function public.validate_prediction_outcome()
returns trigger language plpgsql
set search_path = public as $$
declare
  home_t text;
  away_t text;
  expected text;
begin
  if new.home_score <> new.away_score then
    select home_team, away_team into home_t, away_t from public.matches where id = new.match_id;
    expected := case when new.home_score > new.away_score then home_t else away_t end;
  elsif new.aet_home_score is not null and new.aet_home_score <> new.aet_away_score then
    select home_team, away_team into home_t, away_t from public.matches where id = new.match_id;
    expected := case when new.aet_home_score > new.aet_away_score then home_t else away_t end;
  else
    return new; -- shootout (or incomplete): advancing is a free choice
  end if;

  if new.advancing_team <> expected then
    raise exception 'Advancing team must be the winning side (got %, expected %)',
      new.advancing_team, expected;
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_validate_outcome on public.predictions;
create trigger predictions_validate_outcome
  before insert or update on public.predictions
  for each row execute function public.validate_prediction_outcome();

-- ---- rebuild scoring views with the extra-time bonus -------------------------
drop view if exists public.leaderboard cascade;
drop view if exists public.my_scores cascade;
drop view if exists public.prediction_totals cascade;
drop view if exists public.prediction_scores cascade;

create view public.prediction_scores as
select
  p.id                          as prediction_id,
  p.user_id,
  p.match_id,
  m.round,
  coalesce(r.multiplier, 1)     as multiplier,
  (case when m.advancing_team is not null and p.advancing_team = m.advancing_team
        then cfg.points_advance else 0 end) * coalesce(r.multiplier, 1) as pts_advance,
  (case when m.home_score is not null and m.away_score is not null
             and p.home_score = m.home_score and p.away_score = m.away_score
        then cfg.points_exact else 0 end) * coalesce(r.multiplier, 1) as pts_exact,
  (case when m.home_score is not null and m.away_score is not null
             and sign(p.home_score - p.away_score) = sign(m.home_score - m.away_score)
        then cfg.points_tendency else 0 end) * coalesce(r.multiplier, 1) as pts_tendency,
  (case when m.went_to_penalties is not null and p.penalties = m.went_to_penalties
        then cfg.points_penalties else 0 end) * coalesce(r.multiplier, 1) as pts_penalties,
  (case when m.aet_home_score is not null and p.aet_home_score is not null
             and p.aet_home_score = m.aet_home_score and p.aet_away_score = m.aet_away_score
        then cfg.points_exact_aet else 0 end) * coalesce(r.multiplier, 1) as pts_exact_aet
from public.predictions p
join public.matches m on m.id = p.match_id
left join public.rounds r on r.code = m.round
cross join public.app_config cfg
where m.home_score is not null; -- scored once the result is in

create view public.prediction_totals as
select
  prediction_id, user_id, match_id, round,
  pts_advance, pts_exact, pts_tendency, pts_penalties, pts_exact_aet,
  (pts_advance + pts_exact + pts_tendency + pts_penalties + pts_exact_aet) as total_points
from public.prediction_scores;

create view public.my_scores as
select * from public.prediction_totals where user_id = auth.uid();

create view public.leaderboard as
select
  pr.id                                       as user_id,
  pr.display_name,
  pr.nickname,
  coalesce(sum(pt.total_points), 0)           as total_points,
  count(pt.prediction_id)                     as scored_predictions,
  coalesce(sum((pt.pts_advance > 0)::int), 0) as correct_advances,
  coalesce(sum((pt.pts_exact > 0)::int), 0)   as exact_scores
from public.profiles pr
left join public.prediction_totals pt on pt.user_id = pr.id
group by pr.id, pr.display_name, pr.nickname
order by total_points desc, exact_scores desc, pr.display_name asc;

revoke all on public.prediction_scores from anon, authenticated;
revoke all on public.prediction_totals from anon, authenticated;
grant select on public.my_scores   to authenticated;
grant select on public.leaderboard to authenticated;
-- ▲▲▲ 0004_extra_time.sql ▲▲▲

-- ▼▼▼ 0005_awards.sql ▼▼▼
-- =============================================================================
-- Tournament award predictions (Golden Ball / Boot / Glove, …): one outright
-- pick per user per award, locked before kick-off, scored when the admin enters
-- the real winner, and folded into the leaderboard. Run AFTER 0001–0004.
-- =============================================================================

create table if not exists public.awards (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  description text,
  points      int not null default 10,
  lock_time   timestamptz,          -- picks close at this time (null = always open)
  winner      text,                 -- actual winner, entered by admin
  sort_order  int not null default 0
);

create table if not exists public.award_predictions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  award_id   uuid not null references public.awards (id) on delete cascade,
  pick       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, award_id)
);
create index if not exists award_predictions_user_idx on public.award_predictions (user_id);

drop trigger if exists award_predictions_touch on public.award_predictions;
create trigger award_predictions_touch before update on public.award_predictions
  for each row execute function public.touch_updated_at();

-- picks editable until the award locks (null lock_time = always open)
create or replace function public.award_is_open(a_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce(
    (select lock_time is null or now() < lock_time from public.awards where id = a_id),
    false);
$$;

-- ---- RLS --------------------------------------------------------------------
alter table public.awards            enable row level security;
alter table public.award_predictions enable row level security;

drop policy if exists awards_select on public.awards;
create policy awards_select on public.awards
  for select using (auth.uid() is not null);

drop policy if exists awards_admin_write on public.awards;
create policy awards_admin_write on public.awards
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists award_pred_select_own on public.award_predictions;
create policy award_pred_select_own on public.award_predictions
  for select using (auth.uid() = user_id);

drop policy if exists award_pred_insert_own on public.award_predictions;
create policy award_pred_insert_own on public.award_predictions
  for insert with check (auth.uid() = user_id and public.award_is_open(award_id));

drop policy if exists award_pred_update_own on public.award_predictions;
create policy award_pred_update_own on public.award_predictions
  for update using (auth.uid() = user_id and public.award_is_open(award_id))
  with check (auth.uid() = user_id and public.award_is_open(award_id));

drop policy if exists award_pred_delete_own on public.award_predictions;
create policy award_pred_delete_own on public.award_predictions
  for delete using (auth.uid() = user_id and public.award_is_open(award_id));

-- ---- leaderboard now includes award points ----------------------------------
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
)
select
  pr.id                                              as user_id,
  pr.display_name,
  pr.nickname,
  coalesce(mp.pts, 0) + coalesce(awp.pts, 0)         as total_points,
  coalesce(mp.scored, 0)                             as scored_predictions,
  coalesce(mp.adv, 0)                                as correct_advances,
  coalesce(mp.exact, 0)                              as exact_scores
from public.profiles pr
left join match_pts mp  on mp.user_id = pr.id
left join award_pts awp on awp.user_id = pr.id
order by total_points desc, exact_scores desc, pr.display_name asc;

grant select on public.leaderboard to authenticated;

-- ---- realtime ---------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.awards;
  exception when duplicate_object then null;
  end;
end $$;
-- ▲▲▲ 0005_awards.sql ▲▲▲

-- ▼▼▼ 0006_champion_squads.sql ▼▼▼
-- =============================================================================
-- Add the "Champion" (tournament winner) pick and an award "kind" so picks come
-- from the right list: a team for Champion, a goalkeeper for Golden Glove, any
-- player otherwise. Run AFTER 0005_awards.sql. Safe to re-run.
-- =============================================================================

-- kind: 'team' | 'player' | 'goalkeeper'  (drives the picker + winner entry)
alter table public.awards add column if not exists kind text not null default 'player';

update public.awards set kind = 'team'       where key = 'champion';
update public.awards set kind = 'goalkeeper' where key = 'golden_glove';
update public.awards set kind = 'player'      where key in ('golden_ball', 'golden_boot');

-- Champion: the marquee pick (worth a bit more), locks when the R32 kicks off.
insert into public.awards (key, name, description, kind, points, lock_time, sort_order)
values ('champion', 'Champion', 'Winner of the World Cup', 'team', 15,
        '2026-06-28 19:00:00+00', 0)
on conflict (key) do update
  set kind = excluded.kind;
-- ▲▲▲ 0006_champion_squads.sql ▲▲▲

-- ▼▼▼ 0007_unique_nickname.sql ▼▼▼
-- =============================================================================
-- Nicknames are the single player identity and must be unique (case-insensitive).
-- New users start with a blank nickname and choose one in-app. Run AFTER 0001.
-- If existing rows already collide, resolve them before running.
-- =============================================================================

-- Case-insensitive uniqueness for non-blank nicknames (blanks allowed during signup).
create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(btrim(nickname)))
  where btrim(nickname) <> '';

-- Don't auto-assign a nickname on signup (it could collide and fail the signup);
-- the app forces the user to pick a unique one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, display_name, nickname)
  values (new.id, '', '')
  on conflict (id) do nothing;
  return new;
end;
$$;
-- ▲▲▲ 0007_unique_nickname.sql ▲▲▲

-- ▼▼▼ 0008_profile_emoji.sql ▼▼▼
-- =============================================================================
-- A unique emoji avatar per player, chosen alongside the nickname. Run AFTER
-- 0001–0007. Resolve any existing duplicate emojis before running.
-- =============================================================================

alter table public.profiles add column if not exists emoji text not null default '';

-- one emoji per player (blanks allowed until chosen)
create unique index if not exists profiles_emoji_unique
  on public.profiles (emoji)
  where emoji <> '';

-- ---- expose emoji on the views the app reads -------------------------------
-- locked_predictions: add emoji (appended, so CREATE OR REPLACE is allowed)
create or replace view public.locked_predictions as
select
  p.match_id,
  p.user_id,
  pr.nickname,
  pr.display_name,
  p.home_score,
  p.away_score,
  p.advancing_team,
  p.penalties,
  pr.emoji
from public.predictions p
join public.profiles pr on pr.id = p.user_id
join public.matches m on m.id = p.match_id
where m.lock_time is not null and now() >= m.lock_time;

grant select on public.locked_predictions to authenticated;

-- leaderboard: add emoji (appended at the end)
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
)
select
  pr.id                                              as user_id,
  pr.display_name,
  pr.nickname,
  coalesce(mp.pts, 0) + coalesce(awp.pts, 0)         as total_points,
  coalesce(mp.scored, 0)                             as scored_predictions,
  coalesce(mp.adv, 0)                                as correct_advances,
  coalesce(mp.exact, 0)                              as exact_scores,
  pr.emoji
from public.profiles pr
left join match_pts mp  on mp.user_id = pr.id
left join award_pts awp on awp.user_id = pr.id
order by total_points desc, exact_scores desc, pr.display_name asc;

grant select on public.leaderboard to authenticated;
-- ▲▲▲ 0008_profile_emoji.sql ▲▲▲

-- ▼▼▼ 0009_identity_lock.sql ▼▼▼
-- =============================================================================
-- Nickname + emoji are chosen ONCE by each player. After that, only an admin can
-- change them. Run AFTER 0008. Enforced at the data layer, not just the UI.
-- =============================================================================

-- Admins may update any profile (the own-row policy still covers normal users).
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Lock identity once set: a non-admin can fill in a blank nickname/emoji (first
-- time) but can't change them afterwards; the is_admin flag stays protected too.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- Only guard changes made by a logged-in non-admin user. Server-side changes
  -- (SQL editor, service role — auth.uid() is null) are trusted, so the first
  -- admin can be set up and admins can manage players.
  if auth.uid() is not null and not public.is_admin() then
    -- never let a non-admin change their admin flag
    new.is_admin := old.is_admin;
    -- nickname/display_name lock once a nickname exists
    if btrim(coalesce(old.nickname, '')) <> '' then
      new.nickname := old.nickname;
      new.display_name := old.display_name;
    end if;
    -- emoji locks once chosen
    if btrim(coalesce(old.emoji, '')) <> '' then
      new.emoji := old.emoji;
    end if;
  end if;
  return new;
end;
$$;
-- ▲▲▲ 0009_identity_lock.sql ▲▲▲

-- ▼▼▼ 0010_stats.sql ▼▼▼
-- =============================================================================
-- Views powering the Stats page. Run AFTER 0001–0009.
--   * player_stats           — per-player points by category + accuracy counts
--   * locked_award_predictions — everyone's award picks, revealed after lock
-- =============================================================================

-- Per-player breakdown (only scored matches contribute; awards added in).
create or replace view public.player_stats as
with award_pts as (
  select
    ap.user_id,
    sum(case when a.winner is not null
              and lower(btrim(ap.pick)) = lower(btrim(a.winner))
             then a.points else 0 end) as pts
  from public.award_predictions ap
  join public.awards a on a.id = ap.award_id
  group by ap.user_id
)
select
  pr.id                                          as user_id,
  pr.nickname,
  pr.emoji,
  coalesce(sum(pt.pts_advance), 0)               as pts_advance,
  coalesce(sum(pt.pts_exact), 0)                 as pts_exact,
  coalesce(sum(pt.pts_tendency), 0)              as pts_tendency,
  coalesce(sum(pt.pts_penalties), 0)             as pts_penalties,
  coalesce(sum(pt.pts_exact_aet), 0)             as pts_exact_aet,
  coalesce(max(awp.pts), 0)                      as pts_awards,
  count(pt.prediction_id)                        as scored,
  coalesce(sum((pt.pts_advance > 0)::int), 0)    as correct_advances,
  coalesce(sum((pt.pts_exact > 0)::int), 0)      as exact_scores,
  coalesce(sum((pt.pts_tendency > 0)::int), 0)   as correct_tendencies,
  coalesce(sum((pt.total_points = 0)::int), 0)   as zero_points
from public.profiles pr
left join public.prediction_totals pt on pt.user_id = pr.id
left join award_pts awp on awp.user_id = pr.id
group by pr.id, pr.nickname, pr.emoji;

grant select on public.player_stats to authenticated;

-- Award picks revealed once an award has locked (mirrors locked_predictions).
create or replace view public.locked_award_predictions as
select
  a.key       as award_key,
  a.name      as award_name,
  a.kind      as award_kind,
  ap.user_id,
  pr.nickname,
  pr.emoji,
  ap.pick
from public.award_predictions ap
join public.awards a on a.id = ap.award_id
join public.profiles pr on pr.id = ap.user_id
where a.lock_time is not null and now() >= a.lock_time;

grant select on public.locked_award_predictions to authenticated;
-- ▲▲▲ 0010_stats.sql ▲▲▲

-- ▼▼▼ 0011_single_score.sql ▼▼▼
-- =============================================================================
-- Switch to a SINGLE final score (after extra time, before penalties) per
-- prediction/match. Penalties is derived from a level final score. The separate
-- 90-minute / extra-time scores are retired (columns kept but unused → null).
-- The advancing-winner rules and scoring views already work on the single score
-- once the extra-time columns are null, so only the penalties rule changes.
-- Run AFTER 0001–0010. Safe to re-run.
-- =============================================================================

-- 1) Drop the extra-time-era constraints (penalties + aet shape/bounds).
alter table public.predictions drop constraint if exists predictions_pens_derived;
alter table public.predictions drop constraint if exists predictions_aet_only_on_draw;
alter table public.predictions drop constraint if exists predictions_aet_ge_reg;
alter table public.matches     drop constraint if exists matches_pens_derived;
alter table public.matches     drop constraint if exists matches_aet_only_on_draw;
alter table public.matches     drop constraint if exists matches_aet_ge_reg;

-- 2) Migrate existing data: the final score becomes the after-extra-time score
--    where one was entered; penalties = a level final score; retire aet columns.
update public.predictions
  set home_score = aet_home_score, away_score = aet_away_score
  where aet_home_score is not null;
update public.matches
  set home_score = aet_home_score, away_score = aet_away_score
  where aet_home_score is not null;

update public.predictions set penalties = (home_score = away_score);
update public.matches set went_to_penalties = (home_score is not null and home_score = away_score)
  where home_score is not null;

update public.predictions set aet_home_score = null, aet_away_score = null;
update public.matches     set aet_home_score = null, aet_away_score = null;

-- 3) Penalties is now derived purely from a level final score.
alter table public.predictions add constraint predictions_pens_derived
  check (penalties = (home_score = away_score));
alter table public.matches add constraint matches_pens_derived
  check (
    went_to_penalties is null
    or went_to_penalties = (home_score is not null and home_score = away_score)
  );
-- ▲▲▲ 0011_single_score.sql ▲▲▲

-- ▼▼▼ 0012_penalty_scores.sql ▼▼▼
-- =============================================================================
-- Capture the penalty-shootout tally so finished shootouts can be shown like
-- "1³ – 1⁴" (regulation score with the shootout score as a superscript).
-- The tally is display-only (scoring still uses advancing + penalties yes/no).
-- Run AFTER 0011. Safe to re-run.
-- =============================================================================

alter table public.matches add column if not exists pen_home_score int;
alter table public.matches add column if not exists pen_away_score int;

-- A shootout tally only exists when the match was level (a draw → shootout).
alter table public.matches drop constraint if exists matches_pens_only_on_draw;
alter table public.matches add constraint matches_pens_only_on_draw check (
  (pen_home_score is null and pen_away_score is null)
  or (home_score is not null and home_score = away_score)
);

-- A shootout always has a winner: the two tallies can't be equal.
alter table public.matches drop constraint if exists matches_pens_decisive;
alter table public.matches add constraint matches_pens_decisive check (
  pen_home_score is null or pen_away_score is null or pen_home_score <> pen_away_score
);

-- When a tally is entered, the advancing team must be the side that won it.
alter table public.matches drop constraint if exists matches_pen_winner_advances;
alter table public.matches add constraint matches_pen_winner_advances check (
  pen_home_score is null or pen_away_score is null or advancing_team is null
  or advancing_team = case when pen_home_score > pen_away_score then home_team else away_team end
);
-- ▲▲▲ 0012_penalty_scores.sql ▲▲▲

-- ▼▼▼ 0013_leaderboard_order.sql ▼▼▼
-- =============================================================================
-- Leaderboard tie-breaking: points → exact scores → correct advances. The name
-- (display_name) is kept only as a final stable sort so the row order doesn't
-- flicker; it no longer decides standing — players tied on all three criteria
-- share the same rank (the app renders shared positions). Run AFTER 0008+.
-- Safe to re-run.
-- =============================================================================

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
)
select
  pr.id                                              as user_id,
  pr.display_name,
  pr.nickname,
  coalesce(mp.pts, 0) + coalesce(awp.pts, 0)         as total_points,
  coalesce(mp.scored, 0)                             as scored_predictions,
  coalesce(mp.adv, 0)                                as correct_advances,
  coalesce(mp.exact, 0)                              as exact_scores,
  pr.emoji
from public.profiles pr
left join match_pts mp  on mp.user_id = pr.id
left join award_pts awp on awp.user_id = pr.id
order by total_points desc, exact_scores desc, correct_advances desc, pr.display_name asc;

grant select on public.leaderboard to authenticated;
-- ▲▲▲ 0013_leaderboard_order.sql ▲▲▲

-- ▼▼▼ seed.sql ▼▼▼
-- =============================================================================
-- Seed data for the World Cup 2026 knockout predictor.
-- Run AFTER 0001_init.sql. Safe to re-run (uses upserts).
-- Kick-off times are the REAL official schedule (UTC). Teams are 'TBD' until the
-- group stage resolves each slot — fill them via the in-app "Sync" button or Admin.
-- =============================================================================

-- Rounds with default multipliers (later rounds worth more) --------------------
insert into public.rounds (code, name, sort_order, multiplier) values
  ('R32', 'Round of 32',        1, 1.0),
  ('R16', 'Round of 16',        2, 2.0),
  ('QF',  'Quarter-finals',     3, 3.0),
  ('SF',  'Semi-finals',        4, 4.0),
  ('TP',  'Third-place play-off',5, 2.0),
  ('F',   'Final',              6, 5.0)
on conflict (code) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      multiplier = excluded.multiplier;

-- Default scoring + lock config -----------------------------------------------
-- Panel-agreed model: result 2 + exact +4 (→6) + advancing 4; penalties retired.
insert into public.app_config (id, points_advance, points_exact, points_tendency, points_penalties, lock_minutes_before_kickoff)
values (1, 4, 4, 2, 0, 1)
on conflict (id) do update
  set points_advance  = excluded.points_advance,
      points_exact    = excluded.points_exact,
      points_tendency = excluded.points_tendency,
      points_penalties = excluded.points_penalties,
      lock_minutes_before_kickoff = excluded.lock_minutes_before_kickoff;

-- Tournament award predictions (lock when the Round of 32 ends / R16 begins) ---
insert into public.awards (key, name, description, kind, points, lock_time, sort_order) values
  ('champion',     'Champion',     'Winner of the World Cup',       'team',       15, '2026-07-04 17:00:00+00', 0),
  ('golden_ball',  'Golden Ball',  'Best player of the tournament', 'player',     10, '2026-07-04 17:00:00+00', 1),
  ('golden_boot',  'Golden Boot',  'Top scorer',                    'player',     10, '2026-07-04 17:00:00+00', 2),
  ('golden_glove', 'Golden Glove', 'Best goalkeeper',               'goalkeeper', 10, '2026-07-04 17:00:00+00', 3)
on conflict (key) do update set lock_time = excluded.lock_time;

-- Knockout matches (FIFA match numbers 73–104) --------------------------------
-- Real official kick-off times (stored in UTC; the app shows each user their own
-- local time). Teams stay 'TBD' until the group stage resolves each slot — the
-- in-app "Sync" button (openfootball) or the admin fills them in.
insert into public.matches (match_no, round, home_team, away_team, kickoff_time)
values
  -- Round of 32 (28 Jun – 3 Jul 2026, local venue times in comments)
  (73, 'R32', 'TBD', 'TBD', '2026-06-28 19:00:00+00'),  -- 12:00 PT
  (74, 'R32', 'TBD', 'TBD', '2026-06-29 20:30:00+00'),  -- 16:30 ET
  (75, 'R32', 'TBD', 'TBD', '2026-06-30 01:00:00+00'),  -- 19:00 CT
  (76, 'R32', 'TBD', 'TBD', '2026-06-29 17:00:00+00'),  -- 12:00 ET
  (77, 'R32', 'TBD', 'TBD', '2026-06-30 21:00:00+00'),  -- 17:00 ET
  (78, 'R32', 'TBD', 'TBD', '2026-06-30 17:00:00+00'),  -- 12:00 ET
  (79, 'R32', 'TBD', 'TBD', '2026-07-01 01:00:00+00'),  -- 19:00 CT
  (80, 'R32', 'TBD', 'TBD', '2026-07-01 16:00:00+00'),  -- 12:00 ET
  (81, 'R32', 'TBD', 'TBD', '2026-07-02 00:00:00+00'),  -- 17:00 PT
  (82, 'R32', 'TBD', 'TBD', '2026-07-01 20:00:00+00'),  -- 13:00 PT
  (83, 'R32', 'TBD', 'TBD', '2026-07-02 23:00:00+00'),  -- 19:00 ET
  (84, 'R32', 'TBD', 'TBD', '2026-07-02 19:00:00+00'),  -- 12:00 PT
  (85, 'R32', 'TBD', 'TBD', '2026-07-03 03:00:00+00'),  -- 20:00 PT
  (86, 'R32', 'TBD', 'TBD', '2026-07-03 22:00:00+00'),  -- 18:00 ET
  (87, 'R32', 'TBD', 'TBD', '2026-07-04 01:30:00+00'),  -- 20:30 CT
  (88, 'R32', 'TBD', 'TBD', '2026-07-03 18:00:00+00'),  -- 13:00 CT
  -- Round of 16 (4 – 7 Jul 2026)
  (89, 'R16', 'TBD', 'TBD', '2026-07-04 21:00:00+00'),  -- 17:00 ET
  (90, 'R16', 'TBD', 'TBD', '2026-07-04 17:00:00+00'),  -- 12:00 ET
  (91, 'R16', 'TBD', 'TBD', '2026-07-05 20:00:00+00'),  -- 16:00 ET
  (92, 'R16', 'TBD', 'TBD', '2026-07-06 00:00:00+00'),  -- 18:00 MT
  (93, 'R16', 'TBD', 'TBD', '2026-07-06 19:00:00+00'),  -- 14:00 CT
  (94, 'R16', 'TBD', 'TBD', '2026-07-07 00:00:00+00'),  -- 17:00 PT
  (95, 'R16', 'TBD', 'TBD', '2026-07-07 16:00:00+00'),  -- 12:00 ET
  (96, 'R16', 'TBD', 'TBD', '2026-07-07 20:00:00+00'),  -- 13:00 PT
  -- Quarter-finals (9 – 11 Jul 2026)
  (97, 'QF', 'TBD', 'TBD', '2026-07-09 20:00:00+00'),  -- 16:00 ET
  (98, 'QF', 'TBD', 'TBD', '2026-07-10 19:00:00+00'),  -- 12:00 PT
  (99, 'QF', 'TBD', 'TBD', '2026-07-11 21:00:00+00'),  -- 17:00 ET
  (100, 'QF', 'TBD', 'TBD', '2026-07-12 01:00:00+00'), -- 20:00 CT
  -- Semi-finals (14 – 15 Jul 2026)
  (101, 'SF', 'TBD', 'TBD', '2026-07-14 19:00:00+00'), -- 14:00 CT
  (102, 'SF', 'TBD', 'TBD', '2026-07-15 19:00:00+00'), -- 15:00 ET
  -- Third-place play-off (18 Jul 2026)
  (103, 'TP', 'TBD', 'TBD', '2026-07-18 21:00:00+00'), -- 17:00 ET
  -- Final (19 Jul 2026, MetLife Stadium)
  (104, 'F', 'TBD', 'TBD', '2026-07-19 19:00:00+00')   -- 15:00 ET
on conflict (match_no) do update
  set kickoff_time = excluded.kickoff_time,
      round = excluded.round;

-- Default lock_time = kickoff − lock_minutes_before_kickoff -------------------
update public.matches m
set lock_time = m.kickoff_time - (cfg.lock_minutes_before_kickoff * interval '1 minute')
from public.app_config cfg
where m.kickoff_time is not null;
-- ▲▲▲ seed.sql ▲▲▲
