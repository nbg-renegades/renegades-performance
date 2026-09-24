-- Drift fix. 20251111144603 dropped player_positions.is_primary on the grounds that
-- "the unique constraint on player_id already exists", and the table comment promises
-- "Each player can have exactly one position" - but no migration in this repo ever
-- created that constraint. It was added directly against the Lovable database, so it
-- existed in production and has never existed in a fresh checkout.
--
-- Confirmed by diffing the Lovable export's public schema against `supabase db reset`
-- (2026-09-24): player_positions_player_id_unique UNIQUE (player_id) was the only
-- difference. Same name and shape as the original, so the restored data satisfies it.
--
-- Without this, nothing stops a second row per player: the app deletes before inserting
-- rather than upserting, so a failed delete would silently leave a player with two
-- positions and the roster screens would pick one at random.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.player_positions'::regclass
      and conname = 'player_positions_player_id_unique'
  ) then
    alter table public.player_positions
      add constraint player_positions_player_id_unique unique (player_id);
  end if;
end $$;
