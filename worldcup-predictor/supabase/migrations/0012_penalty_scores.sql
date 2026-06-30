-- =============================================================================
-- Capture the penalty-shootout tally so finished shootouts can be shown like
-- "1³ – 1⁴" (regulation score with the shootout score as a superscript).
-- The tally is display-only (scoring still uses advancing + penalties yes/no).
-- Run AFTER 0011. Safe to re-run.
-- =============================================================================

alter table public.matches add column if not exists pen_home_score int;
alter table public.matches add column if not exists pen_away_score int;

-- A shootout tally only exists when the match was level (a draw → shootout).
alter table public.matches drop constraint if exists matches_pens_only_on_draw;
alter table public.matches add constraint matches_pens_only_on_draw check (
  (pen_home_score is null and pen_away_score is null)
  or (home_score is not null and home_score = away_score)
);

-- A shootout always has a winner: the two tallies can't be equal.
alter table public.matches drop constraint if exists matches_pens_decisive;
alter table public.matches add constraint matches_pens_decisive check (
  pen_home_score is null or pen_away_score is null or pen_home_score <> pen_away_score
);

-- When a tally is entered, the advancing team must be the side that won it.
alter table public.matches drop constraint if exists matches_pen_winner_advances;
alter table public.matches add constraint matches_pen_winner_advances check (
  pen_home_score is null or pen_away_score is null or advancing_team is null
  or advancing_team = case when pen_home_score > pen_away_score then home_team else away_team end
);
