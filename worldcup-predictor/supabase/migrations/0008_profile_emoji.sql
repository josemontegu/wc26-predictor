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
