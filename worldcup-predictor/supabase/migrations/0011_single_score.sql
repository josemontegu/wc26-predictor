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
