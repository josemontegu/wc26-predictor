-- =============================================================================
-- Auto-advance winners into the next round. The moment a knockout result is
-- entered (manually or by the results sync), the winner is written into the
-- correct slot of the next match — so the bracket and R16+ predictions fill
-- themselves without waiting for openfootball to propagate the names.
-- Fill-only: never overwrites a match that's already been played, and only
-- changes a slot when the team actually differs. Run AFTER 0013. Safe to re-run.
-- =============================================================================

create or replace function public.propagate_advancement()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  loser text;
begin
  if new.advancing_team is null then
    return new;
  end if;
  loser := case when new.advancing_team = new.home_team then new.away_team else new.home_team end;

  -- Winner → the HOME slot of the next match (only unplayed slots).
  update public.matches d
    set home_team = new.advancing_team
    where d.home_score is null
      and d.home_team is distinct from new.advancing_team
      and d.match_no = (case new.match_no
        when 74 then 89 when 73 then 90 when 76 then 91 when 79 then 92
        when 83 then 93 when 81 then 94 when 86 then 95 when 85 then 96
        when 89 then 97 when 93 then 98 when 91 then 99 when 95 then 100
        when 97 then 101 when 99 then 102 when 101 then 104 end);

  -- Winner → the AWAY slot of the next match.
  update public.matches d
    set away_team = new.advancing_team
    where d.away_score is null
      and d.away_team is distinct from new.advancing_team
      and d.match_no = (case new.match_no
        when 77 then 89 when 75 then 90 when 78 then 91 when 80 then 92
        when 84 then 93 when 82 then 94 when 88 then 95 when 87 then 96
        when 90 then 97 when 94 then 98 when 92 then 99 when 96 then 100
        when 98 then 101 when 100 then 102 when 102 then 104 end);

  -- Semi-final LOSERS feed the third-place play-off (101→home, 102→away of 103).
  if new.match_no = 101 and new.home_score is not null then
    update public.matches d set home_team = loser
      where d.match_no = 103 and d.home_score is null and d.home_team is distinct from loser;
  elsif new.match_no = 102 and new.home_score is not null then
    update public.matches d set away_team = loser
      where d.match_no = 103 and d.away_score is null and d.away_team is distinct from loser;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_propagate_advancement on public.matches;
create trigger matches_propagate_advancement
  after insert or update on public.matches
  for each row execute function public.propagate_advancement();

-- Backfill: re-fire the trigger for every already-decided match so existing
-- results propagate immediately (no-op value change just to run the logic).
update public.matches set advancing_team = advancing_team where advancing_team is not null;
