-- =============================================================================
-- Admin prediction-status view.
--
-- Lets an admin see WHETHER each player has predicted a given match — so they
-- can nudge anyone who hasn't before kick-off — WITHOUT exposing the pick
-- itself. Prediction content stays private until lock (predictions RLS is
-- select-own; reveal is via locked_predictions only).
--
-- The view runs as its owner (bypassing RLS) so it can compute the boolean
-- across every player, but it exposes only a `predicted` flag, never scores or
-- the advancing team. A `where is_admin()` guard means non-admins get no rows.
--
-- Safe to re-run. Run AFTER 0015.
-- =============================================================================

create or replace view public.match_participation as
select
  m.id       as match_id,
  pr.id      as user_id,
  pr.nickname,
  pr.emoji,
  pr.official,
  exists (
    select 1 from public.predictions p
    where p.match_id = m.id and p.user_id = pr.id
  )          as predicted
from public.matches m
cross join public.profiles pr
where public.is_admin()
  and coalesce(btrim(pr.nickname), '') <> '';

grant select on public.match_participation to authenticated;
