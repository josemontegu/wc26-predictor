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
