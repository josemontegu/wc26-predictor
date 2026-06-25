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
  coalesce(sum((pt.pts_tendency > 0)::int), 0)   as correct_tendencies
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
