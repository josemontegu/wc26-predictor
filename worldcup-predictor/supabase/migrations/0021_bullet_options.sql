-- =============================================================================
-- Multiple-choice bullets.
--
-- Bullets were Yes/No only: bullets.answer and bullet_picks.choice were
-- booleans. To support N-way prop bets (e.g. "Haaland and/or Kane to score?" →
-- both / neither / only Haaland / only Kane) we:
--   • add bullets.options — a jsonb array of {key, label_en, label_es}. NULL
--     means a classic Yes/No bullet, whose behaviour is entirely unchanged.
--   • generalize answer + choice from boolean to a text option key. Existing
--     Yes/No data migrates cleanly: true → 'yes', false → 'no'.
--
-- Scoring is unchanged: flat points when choice = answer (now text = text), and
-- the all-or-nothing "everyone in, or void for all" rule is untouched.
--
-- Postgres won't alter a column a view depends on, so we drop the four views
-- that reference answer/choice, change the columns, then recreate them exactly
-- as they were (leaderboard & player_stats from 0018, bullet_round_points from
-- 0019, locked_bullet_picks from 0016). bullet_participation and bullet_validity
-- don't reference these columns and are left untouched.
--
-- Safe to re-run. Run AFTER 0019.
-- =============================================================================

-- ---- 1. drop the views that reference answer / choice -----------------------
drop view if exists public.leaderboard;
drop view if exists public.player_stats;
drop view if exists public.bullet_round_points;
drop view if exists public.locked_bullet_picks;

-- ---- 2. schema change -------------------------------------------------------
alter table public.bullets add column if not exists options jsonb;

alter table public.bullets
  alter column answer type text
  using (case when answer is null then null when answer then 'yes' else 'no' end);

alter table public.bullet_picks
  alter column choice type text
  using (case when choice then 'yes' else 'no' end);

-- ---- 3. recreate the dropped views ------------------------------------------

-- reveal: everyone's picks, only once the match has locked (choice now text).
create view public.locked_bullet_picks as
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

-- per-round bullet points (unchanged logic; choice = answer now text = text).
create view public.bullet_round_points as
select
  bp.user_id,
  m.round,
  sum(b.points) as pts
from public.bullet_picks bp
join public.bullets b         on b.id = bp.bullet_id
join public.matches m         on m.id = b.match_id
join public.bullet_validity v on v.bullet_id = b.id
where b.answer is not null
  and v.locked = true
  and v.everyone_in = true
  and bp.choice = b.answer
group by bp.user_id, m.round;

grant select on public.bullet_round_points to authenticated;

-- leaderboard (reproduces 0018: bullet_points exposed at the END of the list).
create view public.leaderboard as
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
  coalesce(bwp.pts, 0)                                         as bullet_points
from public.profiles pr
left join match_pts mp   on mp.user_id = pr.id
left join award_pts awp  on awp.user_id = pr.id
left join bullet_pts bwp on bwp.user_id = pr.id
order by total_points desc, exact_scores desc, correct_advances desc, pr.display_name asc;

grant select on public.leaderboard to authenticated;

-- player_stats (reproduces 0018: pts_bullet exposed at the END of the list).
create view public.player_stats as
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
  coalesce(max(bwp.pts), 0)                      as pts_bullet
from public.profiles pr
left join public.prediction_totals pt on pt.user_id = pr.id
left join award_pts awp on awp.user_id = pr.id
left join bullet_pts bwp on bwp.user_id = pr.id
group by pr.id, pr.nickname, pr.emoji;

grant select on public.player_stats to authenticated;
