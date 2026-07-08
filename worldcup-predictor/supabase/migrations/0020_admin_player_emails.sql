-- =============================================================================
-- Admin-only view exposing each player's signup email.
--
-- Lets an admin identify accounts that exist (were invited / signed up) but
-- never claimed a nickname — e.g. someone who got the magic-link email but
-- never opened the app. Exposes nothing beyond id + email, and only to an
-- admin (same `where is_admin()` guard as match_participation).
--
-- Safe to re-run. Run AFTER 0001.
-- =============================================================================

create or replace view public.admin_player_emails as
select id, email
from auth.users
where public.is_admin();

grant select on public.admin_player_emails to authenticated;
