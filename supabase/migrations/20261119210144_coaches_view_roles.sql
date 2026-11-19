-- Let coaches read user_roles, so a coach's browser knows who is on the squad.
--
-- 20251110115001 dropped "Everyone can view all roles", leaving only "Users can view own
-- roles" and the admin policies. The app builds its roster from
-- `user_roles where role = 'player'` (fetchRoster in src/lib/queries.ts), so a coach who is not
-- also an admin got a roster of one: themselves. Everyone else surfaced only through their
-- entries, without a name or a position, so every offense, defense and position comparison held
-- just the coach and scored them 100 across the board, and teammates showed as "Unknown player".
--
-- Coaches can already read every profile, position and performance entry. Who holds which role
-- adds nothing to that, and the roster is exactly what a coach needs it for. Players still see
-- only their own roles. has_role() is SECURITY DEFINER, so this policy does not recurse into
-- user_roles' own row-level security.

create policy "Coaches can view all roles"
  on public.user_roles
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'coach'::public.app_role));
