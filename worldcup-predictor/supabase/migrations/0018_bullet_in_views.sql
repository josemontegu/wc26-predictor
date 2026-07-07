-- =============================================================================
-- Surface bullet (bonus) points in the leaderboard and stats views.
--
-- Bullet points were already folded into leaderboard.total_points (0016). This
-- exposes them as their own column/field too, so the player card and the Stats
-- "by source" breakdown can show the bonus explicitly.
--
-- Safe to re-run. Run AFTER 0016.
-- =============================================================================

-- ---- leaderboard: expose bullet_points (still folded into total) ------------
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
  pr.emoji,
  -- NOTE: appended at the END. CREATE OR REPLACE VIEW only allows adding new
  -- columns after the existing ones; inserting mid-list errors out.
  coalesce(bwp.pts, 0)                                         as bullet_points
from public.profiles pr
left join match_pts mp   on mp.user_id = pr.id
left join award_pts awp  on awp.user_id = pr.id
left join bullet_pts bwp on bwp.user_id = pr.id
order by total_points desc, exact_scores desc, correct_advances desc, pr.display_name asc;

grant select on public.leaderboard to authenticated;

-- ---- player_stats: add pts_bullet -------------------------------------------
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
  coalesce(sum((pt.total_points = 0)::int), 0)   as zero_points,
  -- appended at the END (see note above)
  coalesce(max(bwp.pts), 0)                      as pts_bullet
from public.profiles pr
left join public.prediction_totals pt on pt.user_id = pr.id
left join award_pts awp on awp.user_id = pr.id
left join bullet_pts bwp on bwp.user_id = pr.id
group by pr.id, pr.nickname, pr.emoji;

grant select on public.player_stats to authenticated;
