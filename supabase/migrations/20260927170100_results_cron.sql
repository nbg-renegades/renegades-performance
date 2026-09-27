-- Schedules the homepage's LeagueSphere sync (see 20260927170000_results_schema.sql).
--
-- Once a minute, Postgres calls the `sync-leaguesphere` Edge Function over HTTP. The function
-- decides for itself what is actually due — it does not fetch anything on most ticks. A minute
-- is the cadence the live ticker needs during a game; outside a gameday the function does
-- nothing but read one row and return.
--
-- Why a cron job in the database rather than an external scheduler:
--
--   * Supabase has no built-in scheduler for Edge Functions on the Free plan.
--   * A database-side job is also what keeps the project out of the Free-plan auto-pause,
--     which is what `public.heartbeat` and the GitHub keepalive exist for. This does not
--     replace them yet — see the homepage repo's readme before retiring either.
--
-- Credentials are read from Vault at call time and never appear in this file, in the job
-- definition, or in `cron.job_run_details`. Three secrets have to exist before the job does
-- anything; until then each tick logs a warning and returns. Create them once with:
--
--   select vault.create_secret(
--     'https://ekmdcqcjvodsnaqpsgun.supabase.co/functions/v1/sync-leaguesphere',
--     'results_sync_function_url', 'Endpoint the results sync cron job calls');
--   select vault.create_secret('<service role key>',
--     'results_sync_service_key', 'Bearer token for the results sync cron job');
--   select vault.create_secret('<a long random string>',
--     'results_sync_cron_secret', 'Shared secret proving a sync request came from cron');
--
-- The function requires both: the bearer token satisfies the gateway's verify_jwt, and the
-- cron secret proves the call came from here rather than from anyone who holds a service key.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- A schema for internals that must never be reachable through the API. PostgREST only exposes
-- `public`, so nothing here is callable over HTTP even before the revokes below.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- ── The job body ─────────────────────────────────────────────────────────────

-- SECURITY DEFINER because reading Vault needs privileges the job's caller should not have,
-- and because it must work regardless of who ends up owning the cron entry.
--
-- `search_path = ''` is set so every name below is schema-qualified and cannot be hijacked by
-- a table or function planted in a schema earlier on someone else's search path.
create or replace function private.results_trigger_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_cron_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'results_sync_function_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'results_sync_service_key';
  select decrypted_secret into v_cron_secret
    from vault.decrypted_secrets where name = 'results_sync_cron_secret';

  -- Missing configuration is a setup state, not an error worth failing a job over every
  -- minute for. Warn and do nothing, so the log says what is wrong without filling up.
  if v_url is null or v_key is null or v_cron_secret is null then
    raise warning 'results sync not configured: create the results_sync_* Vault secrets';
    return;
  end if;

  -- Fire and forget. pg_net queues the request and returns immediately, so a slow or hanging
  -- function can never hold a cron worker open or delay the next tick.
  -- pg_net puts its functions in `net` regardless of the schema the extension is registered
  -- in, so this is `net.http_post` and not `extensions.http_post`.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-cron-secret', v_cron_secret
    ),
    body := jsonb_build_object('trigger', 'pg_cron'),
    -- Comfortably longer than the function's own internal timeouts, so pg_net is never the
    -- thing that gives up first.
    timeout_milliseconds := 30000
  );
end;
$$;

comment on function private.results_trigger_sync() is
  'Calls the sync-leaguesphere Edge Function with credentials from Vault. Invoked once a minute by pg_cron.';

-- Nobody but the job needs to call this. Revoking from service_role too means a leaked
-- service key cannot use it to read Vault indirectly.
revoke all on function private.results_trigger_sync() from public, anon, authenticated, service_role;

-- ── The schedule ─────────────────────────────────────────────────────────────

-- Unschedule first so re-running this migration replaces the job instead of failing on a
-- duplicate name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'results-sync-leaguesphere') then
    perform cron.unschedule('results-sync-leaguesphere');
  end if;
end;
$$;

select cron.schedule(
  'results-sync-leaguesphere',
  '* * * * *',
  $$select private.results_trigger_sync()$$
);

-- `cron.job_run_details` grows without bound and is the kind of table that quietly becomes the
-- largest thing in a Free-plan database — 1440 rows a day from this job alone. Keep a week.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'results-sync-prune-cron-history') then
    perform cron.unschedule('results-sync-prune-cron-history');
  end if;
end;
$$;

select cron.schedule(
  'results-sync-prune-cron-history',
  -- Daily at 03:14 UTC, away from the round hour when everything else runs.
  '14 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
