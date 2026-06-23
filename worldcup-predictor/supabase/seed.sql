-- =============================================================================
-- Seed data for the World Cup 2026 knockout predictor.
-- Run AFTER 0001_init.sql. Safe to re-run (uses upserts).
-- Teams are 'TBD' and times are approximate placeholders — the admin edits
-- real fixtures and kickoff times from the in-app Admin panel.
-- =============================================================================

-- Rounds with default multipliers (later rounds worth more) --------------------
insert into public.rounds (code, name, sort_order, multiplier) values
  ('R32', 'Round of 32',        1, 1.0),
  ('R16', 'Round of 16',        2, 1.5),
  ('QF',  'Quarter-finals',     3, 2.0),
  ('SF',  'Semi-finals',        4, 3.0),
  ('TP',  'Third-place play-off',5, 2.0),
  ('F',   'Final',              6, 4.0)
on conflict (code) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;

-- Default scoring + lock config -----------------------------------------------
insert into public.app_config (id) values (1)
on conflict (id) do nothing;

-- Knockout matches (FIFA match numbers 73–104) --------------------------------
-- kickoff/lock left null where unscheduled; admin sets them. We pre-fill a
-- plausible date window per round so the bracket is usable immediately.
insert into public.matches (match_no, round, home_team, away_team, kickoff_time)
values
  -- Round of 32 (28 Jun – 3 Jul 2026)
  (73, 'R32', 'TBD', 'TBD', '2026-06-28 16:00:00+00'),
  (74, 'R32', 'TBD', 'TBD', '2026-06-28 20:00:00+00'),
  (75, 'R32', 'TBD', 'TBD', '2026-06-29 16:00:00+00'),
  (76, 'R32', 'TBD', 'TBD', '2026-06-29 20:00:00+00'),
  (77, 'R32', 'TBD', 'TBD', '2026-06-30 16:00:00+00'),
  (78, 'R32', 'TBD', 'TBD', '2026-06-30 20:00:00+00'),
  (79, 'R32', 'TBD', 'TBD', '2026-07-01 16:00:00+00'),
  (80, 'R32', 'TBD', 'TBD', '2026-07-01 20:00:00+00'),
  (81, 'R32', 'TBD', 'TBD', '2026-07-02 16:00:00+00'),
  (82, 'R32', 'TBD', 'TBD', '2026-07-02 20:00:00+00'),
  (83, 'R32', 'TBD', 'TBD', '2026-07-02 23:00:00+00'),
  (84, 'R32', 'TBD', 'TBD', '2026-07-03 16:00:00+00'),
  (85, 'R32', 'TBD', 'TBD', '2026-07-03 20:00:00+00'),
  (86, 'R32', 'TBD', 'TBD', '2026-07-03 23:00:00+00'),
  (87, 'R32', 'TBD', 'TBD', '2026-07-03 19:00:00+00'),
  (88, 'R32', 'TBD', 'TBD', '2026-07-03 22:00:00+00'),
  -- Round of 16 (4 – 7 Jul 2026)
  (89, 'R16', 'TBD', 'TBD', '2026-07-04 16:00:00+00'),
  (90, 'R16', 'TBD', 'TBD', '2026-07-04 20:00:00+00'),
  (91, 'R16', 'TBD', 'TBD', '2026-07-05 16:00:00+00'),
  (92, 'R16', 'TBD', 'TBD', '2026-07-05 20:00:00+00'),
  (93, 'R16', 'TBD', 'TBD', '2026-07-06 16:00:00+00'),
  (94, 'R16', 'TBD', 'TBD', '2026-07-06 20:00:00+00'),
  (95, 'R16', 'TBD', 'TBD', '2026-07-07 16:00:00+00'),
  (96, 'R16', 'TBD', 'TBD', '2026-07-07 20:00:00+00'),
  -- Quarter-finals (9 – 11 Jul 2026)
  (97, 'QF', 'TBD', 'TBD', '2026-07-09 20:00:00+00'),
  (98, 'QF', 'TBD', 'TBD', '2026-07-10 20:00:00+00'),
  (99, 'QF', 'TBD', 'TBD', '2026-07-11 16:00:00+00'),
  (100, 'QF', 'TBD', 'TBD', '2026-07-11 20:00:00+00'),
  -- Semi-finals (14 – 15 Jul 2026)
  (101, 'SF', 'TBD', 'TBD', '2026-07-14 20:00:00+00'),
  (102, 'SF', 'TBD', 'TBD', '2026-07-15 20:00:00+00'),
  -- Third-place play-off (18 Jul 2026)
  (103, 'TP', 'TBD', 'TBD', '2026-07-18 20:00:00+00'),
  -- Final (19 Jul 2026)
  (104, 'F', 'TBD', 'TBD', '2026-07-19 19:00:00+00')
on conflict (match_no) do nothing;

-- Default lock_time = kickoff − lock_minutes_before_kickoff, where unset -------
update public.matches m
set lock_time = m.kickoff_time - (cfg.lock_minutes_before_kickoff * interval '1 minute')
from public.app_config cfg
where m.lock_time is null and m.kickoff_time is not null;
