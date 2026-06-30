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
