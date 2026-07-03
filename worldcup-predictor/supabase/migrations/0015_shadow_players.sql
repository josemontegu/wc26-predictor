-- Shadow (unofficial) players ---------------------------------------------
-- Friends who join mid-tournament. They predict and earn points exactly like
-- everyone else, but are ranked and counted separately from the official
-- competition. A player is marked shadow by setting official = false.

alter table public.profiles
  add column if not exists official boolean not null default true;

-- Extend the existing profile guard so only an admin can flip the official/
-- shadow flag (mirrors how is_admin is protected). Non-admins' changes revert.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin) and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  if (new.official is distinct from old.official) and not public.is_admin() then
    new.official := old.official;
  end if;
  return new;
end;
$$;
