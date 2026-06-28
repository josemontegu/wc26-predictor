-- =============================================================================
-- Nickname + emoji are chosen ONCE by each player. After that, only an admin can
-- change them. Run AFTER 0008. Enforced at the data layer, not just the UI.
-- =============================================================================

-- Admins may update any profile (the own-row policy still covers normal users).
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Lock identity once set: a non-admin can fill in a blank nickname/emoji (first
-- time) but can't change them afterwards; the is_admin flag stays protected too.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- Only guard changes made by a logged-in non-admin user. Server-side changes
  -- (SQL editor, service role — auth.uid() is null) are trusted, so the first
  -- admin can be set up and admins can manage players.
  if auth.uid() is not null and not public.is_admin() then
    -- never let a non-admin change their admin flag
    new.is_admin := old.is_admin;
    -- nickname/display_name lock once a nickname exists
    if btrim(coalesce(old.nickname, '')) <> '' then
      new.nickname := old.nickname;
      new.display_name := old.display_name;
    end if;
    -- emoji locks once chosen
    if btrim(coalesce(old.emoji, '')) <> '' then
      new.emoji := old.emoji;
    end if;
  end if;
  return new;
end;
$$;
