-- Keep a departed player's results without keeping the player.
--
-- performance_entries.player_id referenced auth.users ON DELETE CASCADE, so removing an
-- account was all or nothing: either the name and login stayed, or every result went with
-- them and the squad's history (session reports, medians, last year's recap) silently lost
-- a player. The terms now say a player who leaves is deleted and their results are kept
-- anonymously, which needs the results to outlive the account.
--
-- Anonymising moves a player's entries to a fresh random id in former_players. That id is
-- the only thing stored about them - no name, no date, no link to the old account - so
-- nothing in the database can say whose results they were. The account is then deleted
-- through the auth admin API as before, and its profile, roles and position go with it.
--
-- Also fixes deleting a coach. performance_entries.created_by referenced auth.users with
-- no ON DELETE action and NOT NULL, so anyone who had ever recorded a result for someone
-- else could not be deleted at all. "Who typed it in" is not worth keeping a person for.

create table public.former_players (
  id uuid primary key default gen_random_uuid()
);

comment on table public.former_players is
  'Anonymous ids that hold the results of deleted players. Deliberately nothing else.';

alter table public.former_players enable row level security;

create policy "Coaches and admins can view former players"
  on public.former_players for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'coach'));

-- Same posture as 20260924100000: explicit grants, nothing for anon. Rows are only ever
-- written by anonymise_player_results below, which runs as its owner.
revoke all on public.former_players from anon;
grant select on public.former_players to authenticated;
grant all on public.former_players to service_role;

-- Both foreign keys are found by column rather than by name: the Lovable database was not
-- created from these migrations, so its constraint names are not guaranteed.
do $$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.performance_entries'::regclass
      and c.contype = 'f'
      and a.attname in ('player_id', 'created_by')
  loop
    execute format('alter table public.performance_entries drop constraint %I', fk.conname);
  end loop;
end $$;

alter table public.performance_entries alter column created_by drop not null;

alter table public.performance_entries
  add constraint performance_entries_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- player_id can no longer be a foreign key, because it points at one of two tables. These
-- two triggers put back what the foreign key did: an entry must belong to someone who
-- exists, and deleting an account by any route - the dashboard, the API - still deletes
-- that person's results. Only anonymise_player_results moves them out of the way first.

create function public.performance_entry_player_exists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users where id = new.player_id)
     and not exists (select 1 from public.former_players where id = new.player_id) then
    raise exception 'player % does not exist', new.player_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger performance_entries_player_exists
  before insert or update of player_id on public.performance_entries
  for each row execute function public.performance_entry_player_exists();

create function public.delete_entries_of_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.performance_entries where player_id = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted_delete_entries
  after delete on auth.users
  for each row execute function public.delete_entries_of_deleted_user();

-- Moves every result of one player to a new former_players id and returns how many moved.
-- Creates no former_players row when there is nothing to move, so a player who was never
-- tested leaves no trace at all.
--
-- Only the service role may call it: the delete-user function checks that the caller is
-- an admin first. New functions in public are executable by anon and authenticated by
-- default on Supabase, hence the explicit revoke.
create function public.anonymise_player_results(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  former_id uuid;
  moved integer;
begin
  if not exists (select 1 from public.performance_entries where player_id = p_user_id) then
    return 0;
  end if;

  insert into public.former_players default values returning id into former_id;

  update public.performance_entries
  set player_id = former_id
  where player_id = p_user_id;
  get diagnostics moved = row_count;

  return moved;
end;
$$;

revoke all on function public.anonymise_player_results(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_player_results(uuid) to service_role;

revoke all on function public.performance_entry_player_exists() from public, anon, authenticated;
revoke all on function public.delete_entries_of_deleted_user() from public, anon, authenticated;
