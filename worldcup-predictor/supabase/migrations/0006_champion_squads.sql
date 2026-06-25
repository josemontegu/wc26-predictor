-- =============================================================================
-- Add the "Champion" (tournament winner) pick and an award "kind" so picks come
-- from the right list: a team for Champion, a goalkeeper for Golden Glove, any
-- player otherwise. Run AFTER 0005_awards.sql. Safe to re-run.
-- =============================================================================

-- kind: 'team' | 'player' | 'goalkeeper'  (drives the picker + winner entry)
alter table public.awards add column if not exists kind text not null default 'player';

update public.awards set kind = 'team'       where key = 'champion';
update public.awards set kind = 'goalkeeper' where key = 'golden_glove';
update public.awards set kind = 'player'      where key in ('golden_ball', 'golden_boot');

-- Champion: the marquee pick (worth a bit more), locks when the R32 kicks off.
insert into public.awards (key, name, description, kind, points, lock_time, sort_order)
values ('champion', 'Champion', 'Winner of the World Cup', 'team', 15,
        '2026-06-28 19:00:00+00', 0)
on conflict (key) do update
  set kind = excluded.kind;
