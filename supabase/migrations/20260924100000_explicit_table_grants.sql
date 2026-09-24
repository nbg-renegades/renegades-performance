-- Hosted projects created from ~Sep 2026 no longer inherit table grants for
-- anon/authenticated; the local stack still does. Make them explicit so local
-- and production agree. RLS keeps governing which rows each role sees.
--
-- A sibling project of ours created 2026-09-18 shipped with a public-schema default
-- ACL that gave anon/authenticated no SELECT at all, which broke every direct table
-- read. `supabase start` grants by default, so a local rehearsal cannot catch it.
--
-- anon gets nothing on purpose: every policy in this schema requires auth.uid().
-- The edge functions connect as service_role, which bypasses RLS but still needs
-- table privileges.

grant select, insert, update, delete
  on public.profiles, public.user_roles, public.player_positions, public.performance_entries
  to authenticated;

grant all
  on public.profiles, public.user_roles, public.player_positions, public.performance_entries
  to service_role;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.get_best_daily_entries() to authenticated;
