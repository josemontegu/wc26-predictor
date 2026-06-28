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
  lock_minutes_before_kickoff int not null default 60,  -- default lock offset
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
