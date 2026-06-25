-- =============================================================================
-- Seed data for the World Cup 2026 knockout predictor.
-- Run AFTER 0001_init.sql. Safe to re-run (uses upserts).
-- Kick-off times are the REAL official schedule (UTC). Teams are 'TBD' until the
-- group stage resolves each slot — fill them via the in-app "Sync" button or Admin.
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

-- Tournament award predictions (lock when the Round of 32 kicks off) -----------
insert into public.awards (key, name, description, kind, points, lock_time, sort_order) values
  ('champion',     'Champion',     'Winner of the World Cup',       'team',       15, '2026-06-28 19:00:00+00', 0),
  ('golden_ball',  'Golden Ball',  'Best player of the tournament', 'player',     10, '2026-06-28 19:00:00+00', 1),
  ('golden_boot',  'Golden Boot',  'Top scorer',                    'player',     10, '2026-06-28 19:00:00+00', 2),
  ('golden_glove', 'Golden Glove', 'Best goalkeeper',               'goalkeeper', 10, '2026-06-28 19:00:00+00', 3)
on conflict (key) do nothing;

-- Knockout matches (FIFA match numbers 73–104) --------------------------------
-- Real official kick-off times (stored in UTC; the app shows each user their own
-- local time). Teams stay 'TBD' until the group stage resolves each slot — the
-- in-app "Sync" button (openfootball) or the admin fills them in.
insert into public.matches (match_no, round, home_team, away_team, kickoff_time)
values
  -- Round of 32 (28 Jun – 3 Jul 2026, local venue times in comments)
  (73, 'R32', 'TBD', 'TBD', '2026-06-28 19:00:00+00'),  -- 12:00 PT
  (74, 'R32', 'TBD', 'TBD', '2026-06-29 20:30:00+00'),  -- 16:30 ET
  (75, 'R32', 'TBD', 'TBD', '2026-06-30 01:00:00+00'),  -- 19:00 CT
  (76, 'R32', 'TBD', 'TBD', '2026-06-29 17:00:00+00'),  -- 12:00 ET
  (77, 'R32', 'TBD', 'TBD', '2026-06-30 21:00:00+00'),  -- 17:00 ET
  (78, 'R32', 'TBD', 'TBD', '2026-06-30 17:00:00+00'),  -- 12:00 ET
  (79, 'R32', 'TBD', 'TBD', '2026-07-01 01:00:00+00'),  -- 19:00 CT
  (80, 'R32', 'TBD', 'TBD', '2026-07-01 16:00:00+00'),  -- 12:00 ET
  (81, 'R32', 'TBD', 'TBD', '2026-07-02 00:00:00+00'),  -- 17:00 PT
  (82, 'R32', 'TBD', 'TBD', '2026-07-01 20:00:00+00'),  -- 13:00 PT
  (83, 'R32', 'TBD', 'TBD', '2026-07-02 23:00:00+00'),  -- 19:00 ET
  (84, 'R32', 'TBD', 'TBD', '2026-07-02 19:00:00+00'),  -- 12:00 PT
  (85, 'R32', 'TBD', 'TBD', '2026-07-03 03:00:00+00'),  -- 20:00 PT
  (86, 'R32', 'TBD', 'TBD', '2026-07-03 22:00:00+00'),  -- 18:00 ET
  (87, 'R32', 'TBD', 'TBD', '2026-07-04 01:30:00+00'),  -- 20:30 CT
  (88, 'R32', 'TBD', 'TBD', '2026-07-03 18:00:00+00'),  -- 13:00 CT
  -- Round of 16 (4 – 7 Jul 2026)
  (89, 'R16', 'TBD', 'TBD', '2026-07-04 21:00:00+00'),  -- 17:00 ET
  (90, 'R16', 'TBD', 'TBD', '2026-07-04 17:00:00+00'),  -- 12:00 ET
  (91, 'R16', 'TBD', 'TBD', '2026-07-05 20:00:00+00'),  -- 16:00 ET
  (92, 'R16', 'TBD', 'TBD', '2026-07-06 00:00:00+00'),  -- 18:00 MT
  (93, 'R16', 'TBD', 'TBD', '2026-07-06 19:00:00+00'),  -- 14:00 CT
  (94, 'R16', 'TBD', 'TBD', '2026-07-07 00:00:00+00'),  -- 17:00 PT
  (95, 'R16', 'TBD', 'TBD', '2026-07-07 16:00:00+00'),  -- 12:00 ET
  (96, 'R16', 'TBD', 'TBD', '2026-07-07 20:00:00+00'),  -- 13:00 PT
  -- Quarter-finals (9 – 11 Jul 2026)
  (97, 'QF', 'TBD', 'TBD', '2026-07-09 20:00:00+00'),  -- 16:00 ET
  (98, 'QF', 'TBD', 'TBD', '2026-07-10 19:00:00+00'),  -- 12:00 PT
  (99, 'QF', 'TBD', 'TBD', '2026-07-11 21:00:00+00'),  -- 17:00 ET
  (100, 'QF', 'TBD', 'TBD', '2026-07-12 01:00:00+00'), -- 20:00 CT
  -- Semi-finals (14 – 15 Jul 2026)
  (101, 'SF', 'TBD', 'TBD', '2026-07-14 19:00:00+00'), -- 14:00 CT
  (102, 'SF', 'TBD', 'TBD', '2026-07-15 19:00:00+00'), -- 15:00 ET
  -- Third-place play-off (18 Jul 2026)
  (103, 'TP', 'TBD', 'TBD', '2026-07-18 21:00:00+00'), -- 17:00 ET
  -- Final (19 Jul 2026, MetLife Stadium)
  (104, 'F', 'TBD', 'TBD', '2026-07-19 19:00:00+00')   -- 15:00 ET
on conflict (match_no) do update
  set kickoff_time = excluded.kickoff_time,
      round = excluded.round;

-- Default lock_time = kickoff − lock_minutes_before_kickoff -------------------
update public.matches m
set lock_time = m.kickoff_time - (cfg.lock_minutes_before_kickoff * interval '1 minute')
from public.app_config cfg
where m.kickoff_time is not null;
