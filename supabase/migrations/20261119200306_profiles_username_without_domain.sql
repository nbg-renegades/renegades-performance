-- Store the username a member signs in with, not the email built from it.
--
-- Members sign in with a username, and the app turns it into the email `<username>@team.local`
-- for Supabase Auth. 20251112200554 renamed profiles.email to username but left
-- handle_new_user() copying NEW.email into it, so every profile holds "name@team.local". The
-- Users page shows that as the username, and the change-password flow appended the domain a
-- second time and could never succeed (fixed on the client in 5588440, which no longer reads
-- this column).
--
-- Only the "@team.local" suffix is stripped. An account with any other email keeps it whole,
-- since there is no username to recover from it. Nothing reads profiles.username to sign in,
-- and the column has no unique constraint, so the backfill cannot collide or lock anyone out.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, username, first_name, last_name)
  values (
    new.id,
    regexp_replace(new.email, '@team\.local$', ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$function$;

update public.profiles
  set username = regexp_replace(username, '@team\.local$', '')
  where username like '%@team.local';
