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
