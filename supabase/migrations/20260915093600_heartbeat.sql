-- Keeps the project out of the Free-plan auto-pause.
--
-- Supabase pauses a Free project after ~7 days without *database* activity. This site
-- uses Supabase purely as an Edge Function host to reach Resend, so Postgres was never
-- touched and the inactivity clock never reset — the previous project (us-west-1) paused,
-- its DNS stopped resolving, and every form failed with FunctionsFetchError before the
-- request left the browser.
--
-- One row, read once a day by .github/workflows/supabase-keepalive.yml, is enough to
-- count as activity. Nothing in the application reads this table.

create table if not exists public.heartbeat (
  id smallint primary key default 1,
  last_seen timestamptz not null default now(),
  constraint heartbeat_single_row check (id = 1)
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

-- Readable by anon so the scheduled ping needs no service-role key in CI. The table
-- holds no data beyond a timestamp, and writes are not granted to anyone.
drop policy if exists "heartbeat is world readable" on public.heartbeat;
create policy "heartbeat is world readable"
  on public.heartbeat
  for select
  to anon, authenticated
  using (true);
