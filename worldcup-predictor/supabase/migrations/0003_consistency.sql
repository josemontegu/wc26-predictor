-- =============================================================================
-- Outcome consistency — enforce the rules of knockout football at the data layer
-- so impossible predictions/results can never be stored, even by a buggy or
-- bypassed client:
--   * penalties can only happen when the 90-minute score is LEVEL
--   * a decisive 90-minute score means the WINNER advances
-- Run AFTER 0001_init.sql. If you have existing rows that already violate these,
-- fix them first (these ADD CONSTRAINTs validate immediately).
-- =============================================================================

-- ---- predictions: penalties only on a draw -----------------------------------
alter table public.predictions drop constraint if exists predictions_pens_requires_draw;
alter table public.predictions
  add constraint predictions_pens_requires_draw
  check (penalties = false or home_score = away_score);

-- ---- matches: penalties only on a draw (nulls allowed until result entered) ---
alter table public.matches drop constraint if exists matches_pens_requires_draw;
alter table public.matches
  add constraint matches_pens_requires_draw
  check (
    went_to_penalties is not true
    or home_score is null or away_score is null
    or home_score = away_score
  );

-- ---- matches: a decisive score => advancing team is the winner ----------------
alter table public.matches drop constraint if exists matches_advance_matches_winner;
alter table public.matches
  add constraint matches_advance_matches_winner
  check (
    home_score is null or away_score is null
    or home_score = away_score          -- a draw: advancing is a free choice
    or advancing_team is null
    or advancing_team = case when home_score > away_score then home_team else away_team end
  );

-- ---- predictions: a decisive score => advancing team is the winner ------------
-- Needs the match's team names, so this is a trigger rather than a CHECK.
create or replace function public.validate_prediction_outcome()
returns trigger language plpgsql
set search_path = public as $$
declare
  ht text;
  at text;
begin
  if new.home_score <> new.away_score then
    select home_team, away_team into ht, at from public.matches where id = new.match_id;
    if new.advancing_team <> case when new.home_score > new.away_score then ht else at end then
      raise exception
        'Advancing team must be the side winning the 90-minute score (got %, expected %)',
        new.advancing_team,
        case when new.home_score > new.away_score then ht else at end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_validate_outcome on public.predictions;
create trigger predictions_validate_outcome
  before insert or update on public.predictions
  for each row execute function public.validate_prediction_outcome();
