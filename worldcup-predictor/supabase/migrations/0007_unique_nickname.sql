-- =============================================================================
-- Nicknames are the single player identity and must be unique (case-insensitive).
-- New users start with a blank nickname and choose one in-app. Run AFTER 0001.
-- If existing rows already collide, resolve them before running.
-- =============================================================================

-- Case-insensitive uniqueness for non-blank nicknames (blanks allowed during signup).
create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(btrim(nickname)))
  where btrim(nickname) <> '';

-- Don't auto-assign a nickname on signup (it could collide and fail the signup);
-- the app forces the user to pick a unique one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, display_name, nickname)
  values (new.id, '', '')
  on conflict (id) do nothing;
  return new;
end;
$$;
