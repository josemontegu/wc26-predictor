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
