-- =============================================================================
-- Per-round bullet points.
--
-- A bullet belongs to a match, and a match to a round — so its bonus points are
-- attributed to that round. This view exposes each player's winning bullet
-- points broken down by round, so the "by round" stats and the per-round
-- leaderboard views can include them.
--
-- Safe to re-run. Run AFTER 0016.
-- =============================================================================

create or replace view public.bullet_round_points as
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
