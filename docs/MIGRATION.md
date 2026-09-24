# Migration: off Lovable → Supabase (`renegades-eu`) + Netlify

Status: **planned, not started.** v1 drafted 2026-08-06, v3 2026-09-24. Earlier versions are in git history.

This plan spans **two repositories**:

| Short name | Repo | Role after migration |
|---|---|---|
| **perf** | `nbg-renegades/renegades-performance` (this repo) | Performance app on Netlify. **Owns the schema of the shared Supabase project.** |
| **home** | `phhbr/renegades` | Club homepage (Angular SSR on Netlify). Keeps deploying its own three `send-*` edge functions to the same project. |

Tasks are tagged **[perf]**, **[home]**, or **[human]**. [human] tasks need a dashboard, email or
account that an agent has no access to: Lovable, Supabase dashboard, Netlify, GitHub secrets.

## Target state

```text
performance.nuernberg-renegades.de ─► Netlify site (perf)  ─┐
www.nuernberg-renegades.de         ─► Netlify site (home)  ─┼─► Supabase "renegades-eu"
                                                            │   ref ekmdcqcjvodsnaqpsgun
GitHub Actions: keepalive (home), nightly backup (perf) ────┘   eu-central-1, PG 17, Free tier
```

One Supabase project, two apps. Nothing collides:

| Shared resource | home | perf |
|---|---|---|
| `public` tables | `heartbeat` | `profiles`, `user_roles`, `player_positions`, `performance_entries` |
| Edge functions | `send-contact-email`, `send-tryout-email`, `send-membership-application` | `create-user`, `delete-user`, `get-dashboard-stats`, `get-performance-averages`, `get-performance-benchmarks`, `get-player-neighborhood`, `reset-user-password` |
| Secrets | `RESEND_API_KEY`, `NOTIFICATION_EMAILS`, `RECAPTCHA_SECRET_KEY` | `ALLOWED_ORIGINS` |
| Auth users | none (forms are anonymous) | admin-provisioned `firstname.lastname@team.local` |

What sharing does mean:

- **One migration history.** Only **perf** runs `supabase db push`.
- **One set of API keys.** A rotation or disable affects both apps.
- **Shared free-tier quotas.** Both apps go down together if the project pauses or runs over quota.

## Verified facts (2026-09-24)

These drove the plan. Re-check any that look surprising before acting on them.

1. **Live backend** is Lovable Cloud project `rqzkzstltfdtypkvriue`, which is not in our Supabase
   account. Our account holds exactly the two Free-tier projects: `renegades-eu` (above) and
   `vbs` (another app, out of scope).
2. **The app is effectively unused.** There is no pressure on downtime and there are several
   weeks of slack, so there is no write freeze, no second export and no maintenance window.
3. **Lovable's official export** (More → Cloud → Overview → Advanced settings → *Export project
   data*) contains the full database, **including `auth.users` with password hashes**. Users keep
   their passwords. It excludes storage, edge function code and secrets, none of which we need.
   Limit: one export per 24 h. The file contains password hashes: **never commit it**, keep it
   outside both repos, and delete it after Phase 5.
4. **`renegades-eu` has legacy API keys.** The homepage calls it with a legacy `eyJ…` anon JWT,
   and its keepalive gets HTTP 200. So perf's edge functions (`SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY`, `verify_jwt = true`) should work unchanged. Moving to the new
   `sb_publishable_`/`sb_secret_` keys is follow-up work for **both** repos (see "Later").
   **Nobody disables the legacy keys in the dashboard until both repos have moved.**
5. **Hosted projects created recently may not grant table privileges by default.** Our `vbs`
   project (created 2026-09-18) has a public-schema default ACL for `anon`/`authenticated` with no
   `SELECT`, which broke direct table reads there. The local `supabase start` stack *does* grant
   by default, so **a local rehearsal cannot catch this.** perf reads and writes all four tables
   directly via supabase-js, and its 2025 migrations contain no `GRANT`s. `renegades-eu` serves
   `heartbeat` to anon, which suggests it may be fine, but that proves nothing about tables
   created later. Fix it with an explicit grants migration either way (A1).
6. **Schema drift suspect.** `20251111144603` says *"the unique constraint on player_id already
   exists"*, but no migration creates one. The drift gate (Phase 2) settles it.
7. **Vite does not let `.env` override variables that are already set**, so Netlify env vars
   win. The committed `.env` still goes, so that local runs can never hit production silently.
8. **Domain:** `performance.nuernberg-renegades.de` is in a Netlify DNS zone (NS1). Today it has
   an A record to `185.158.133.1`, which is Lovable behind Cloudflare.
9. **home's keepalive failed for 6 days in a row** (2026-09-18 → 09-22, HTTP 401 "Invalid API
   key") before being fixed on 09-23. Free projects pause after about 7 days without database
   activity. Once perf's data lives here, that margin matters (see A8).

## Workstream A: perf repo (one PR)

- **A1 [perf] Explicit grants migration.** Add a new migration, newer than the heartbeat one
  (so after `20260915093600`):

  ```sql
  -- Hosted projects created from ~Sep 2026 no longer inherit table grants for
  -- anon/authenticated; the local stack still does. Make them explicit so local
  -- and production agree. RLS keeps governing which rows each role sees.
  grant select, insert, update, delete
    on public.profiles, public.user_roles, public.player_positions, public.performance_entries
    to authenticated;
  grant all
    on public.profiles, public.user_roles, public.player_positions, public.performance_entries
    to service_role;
  grant execute on function public.has_role(uuid, public.app_role) to authenticated;
  grant execute on function public.get_best_daily_entries() to authenticated;
  ```

  `anon` gets nothing: every perf policy requires `auth.uid()`. The edge functions use
  `service_role`, which bypasses RLS but still needs table privileges.
- **A2 [perf] Adopt the heartbeat migration.** Copy `supabase/migrations/20260915093600_heartbeat.sql`
  from home **byte for byte, same filename**. It is already applied on `renegades-eu`. Because
  it is newer than our 21 migrations, the first push needs `supabase db push --include-all`.
- **A3 [perf] `supabase/config.toml`:** `project_id = "ekmdcqcjvodsnaqpsgun"`. Leave
  `verify_jwt = true` (fact 4).
- **A4 [perf] `.env` out of git.** `git rm --cached .env`, add `.env` to `.gitignore`, and commit
  `.env.example` with the `renegades-eu` URL, the project ID and a placeholder key.
- **A5 [perf] Regenerate `src/integrations/supabase/types.ts`** from `renegades-eu` after Phase 3's
  push (`supabase gen types typescript --project-id ekmdcqcjvodsnaqpsgun`). It will now also list
  `heartbeat`, which is expected. Then run `npm run lint`, `npx tsc --noEmit` and `npm run build`.
- **A6 [perf] Drift fixes.** Add any migrations that Phase 2's drift gate asks for. They go in this
  same PR if Phase 2 runs first, otherwise in a follow-up.
- **A7 [perf] README.** Add a section saying this repo owns the schema of the shared project,
  which also hosts the homepage's `heartbeat` table and `send-*` functions. **Never** drop those,
  and never run a bare `supabase functions delete`.
- **A8 [perf] Nightly backup workflow** (`.github/workflows/db-backup.yml`). Use
  `supabase db dump --db-url "$SUPABASE_DB_URL"` three times: `--role-only`, schema, and
  `--data-only --use-copy`. Upload the result as an artifact with about 30 days retention. It
  covers both apps. It also touches the database daily, which gives a second keepalive
  independent of home's. It needs the `SUPABASE_DB_URL` secret (H6), which is the **session
  pooler** URI because the direct host is IPv6-only.
- **A9 [perf] Delete the stale Lovable branches** `origin/edit/edt-*`, after H1.

Not needed now: the edge-function key helper and `verify_jwt = false` (fact 4 makes both optional).

## Workstream B: home repo (one PR)

- **B1 [home] Stop owning schema.** After A2 has merged, delete `supabase/migrations/`. Keep
  `supabase/config.toml` and `supabase/functions/`: home still deploys its three functions by name.
- **B2 [home] README.** Update the "Database tables: `public.heartbeat` only" / "Row Level
  Security: not applicable" paragraph. The project now also holds the performance app's personal
  data, schema changes go through `nbg-renegades/renegades-performance`, and the legacy keys must
  not be disabled or rotated without updating both repos.
- **B3 [home] Optional: tighten CORS.** `_shared/cors.ts` sends `Access-Control-Allow-Origin: *`.
  reCAPTCHA already limits abuse, but on a shared project, form spam from any origin burns quota
  both apps depend on. Restrict it to the homepage's own origins plus `localhost`.
- **B4 [human] Optional: transfer `phhbr/renegades` to the `nbg-renegades` org.** Club
  infrastructure should not live in one person's account. GitHub redirects the old URLs, but the
  Netlify site's repo link needs reconnecting afterwards.

## Phase 0: Stop Lovable (human)

- **H1** No more edits in the Lovable editor. Disconnect Lovable's GitHub integration from perf,
  or it may keep pushing to `main` and reverting `.env` / `client.ts`.
- **H2** Unpublish the Lovable site. Nobody uses it, and it guarantees the export is final. One
  export then serves both the rehearsal and production.
- **H3** Request the export and download it to a folder **outside both repos**. Tell the agent the
  path.

## Phase 1: Code (agent)

Workstream A (except A5/A6), then B. These can merge before any data moves: nothing here touches
the live app.

## Phase 2: Local rehearsal (agent, offline)

```sh
# Inspect the export first; the format decides the commands below
file <export>                  # zstd? plain SQL? pg_dump custom format?
zstd -d <export>.zst           # if compressed
pg_restore -l <export> | less  # if custom format

supabase start && supabase db reset   # perf's migrations incl. A1/A2
LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# DRIFT GATE: Lovable's public schema vs ours (heartbeat and grants will differ, ignore those)
pg_restore --schema-only --schema=public --no-owner -f lovable-schema.sql <export>
supabase db dump --local --schema public -f ours-schema.sql
diff <(grep -v '^--' lovable-schema.sql) <(grep -v '^--' ours-schema.sql)
```

Every real difference becomes a migration (A6), starting with the `player_positions` unique
constraint. Repeat until clean.

```sh
# Data only: exactly perf's four tables plus the auth tables password login needs
pg_restore -l <export> | grep -E 'TABLE DATA (public (profiles|user_roles|player_positions|performance_entries)|auth (users|identities)) ' > restore.list
pg_restore -L restore.list --data-only --no-owner -f data.sql <export>

psql "$LOCAL" -v ON_ERROR_STOP=1 --single-transaction \
  -c 'SET session_replication_role = replica' -f data.sql
```

- `replica` mode skips `on_auth_user_created` and the FK checks for this session, so load order
  does not matter and nothing needs re-enabling.
- Sessions, refresh tokens and audit logs are left behind on purpose.
- If the export is plain SQL, filter the file instead.
- If `ON_ERROR_STOP` trips on `auth.users` columns, the Auth versions differ: map the columns
  explicitly.

**Verification gate** (run here and again in Phase 3):

```sql
select 'users', count(*) from auth.users union all
select 'identities', count(*) from auth.identities union all
select 'profiles', count(*) from profiles union all
select 'user_roles', count(*) from user_roles union all
select 'positions', count(*) from player_positions union all
select 'entries', count(*) from performance_entries;
select role, count(*) from user_roles group by role;             -- admin, coach, player all > 0
select count(*) from performance_entries e
  left join profiles p on p.id = e.player_id where p.id is null;  -- must be 0
```

Then run the app against the stack (`VITE_SUPABASE_URL=http://127.0.0.1:54321`,
`supabase functions serve`) and **log in with a real account and its real password** (H: ask the
user for a test account). Exercise the dashboard, a performance entry, the percentiles, and user
admin (create, reset, delete).

## Phase 3: Production on `renegades-eu`

1. **[human] H4 Supabase dashboard:**
   - Settings → API Keys → *Legacy API keys*: confirm they are enabled (fact 4).
   - Auth: **disable sign-ups** (home uses no auth, so this is safe).
   - Auth: email confirmation off, because `@team.local` cannot receive mail.
   - Auth: Site URL `https://performance.nuernberg-renegades.de`.
2. **[human] H6** Put the session pooler URI into perf's GitHub secret `SUPABASE_DB_URL` and give
   it to the agent for this session.
3. **[agent]** Pre-flight: `select count(*) from auth.users` must be 0, and
   `select tablename from pg_tables where schemaname='public'` must list only `heartbeat`.
4. **[agent]** Schema and functions:

   ```sh
   supabase link --project-ref ekmdcqcjvodsnaqpsgun
   supabase db push --include-all          # 21 + A1 + A6; heartbeat already applied
   supabase functions deploy create-user delete-user get-dashboard-stats \
     get-performance-averages get-performance-benchmarks get-player-neighborhood reset-user-password
   supabase secrets set ALLOWED_ORIGINS="https://performance.nuernberg-renegades.de,https://<netlify-site>.netlify.app"
   ```

   Name the functions explicitly, so nobody later reaches for a bulk command that treats home's
   functions as strays.
5. **[agent]** Restore data with Phase 2's commands against `$SUPABASE_DB_URL`. Run the
   verification gate, plus the grants check (fact 5):
   `select has_table_privilege('authenticated','public.performance_entries','insert');` must be `t`.
6. **[agent]** A5: regenerate types, then build.
7. **[human] H5 Netlify:** create the site from perf's repo and set `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PROJECT_ID` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the legacy anon key). Log in
   with a real account on the `*.netlify.app` URL and smoke-test the Phase 2 flows. The main
   thing to watch for is a gateway `401 Invalid JWT` on the edge functions. If that happens, set
   `verify_jwt = false` for perf's functions. That is safe because each function checks
   `auth.getUser()` and the role itself.
8. **[human]** Check that home's forms still send mail.

## Phase 4: Cutover (human, ~15 min)

1. Remove the custom domain from the Lovable project.
2. In Netlify DNS, delete the `performance` A record (`185.158.133.1`), then add
   `performance.nuernberg-renegades.de` to the perf site. Netlify creates the record and issues
   TLS.
3. Log in on the real domain, then tell the club the app is back. Everyone logs in once, with
   their old password.

**Rollback** until Phase 5: point the domain back at Lovable and republish there. The Lovable
database was never written to, so it is exactly as it was. Anything entered on the new site since
then would need replaying by hand.

## Phase 5: Decommission (≈2 weeks after cutover, human)

1. Archive the export in the club's password manager or other secure storage, then delete every
   other copy.
2. **Remove Lovable Cloud.** This is irreversible and deletes the old database and keys. Then
   delete the Lovable project.

## Later (not part of the migration)

- **[perf] + [home] Move off the legacy API keys** before Supabase retires them. perf needs a
  `_shared/` helper that reads `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` with a
  legacy fallback, plus `verify_jwt = false`, since the gateway check only understands legacy
  JWTs. home needs its `environment.ts` key and its keepalive secret swapped. Disable the legacy
  keys in the dashboard only after **both** have shipped.
- **Supabase DPA:** perf's terms dialog promises GDPR compliance, so sign Supabase's DPA for the
  org.
- **Free-tier limits:** if the project ever pauses despite two keepalives, move it to Pro.
- `vbs` moving to the VPS, and a monorepo, were both considered and deferred. Neither blocks this
  plan.

## Risk register

| Risk | Mitigation |
|---|---|
| Missing table grants on the hosted project, invisible locally | A1 explicit grants, plus the `has_table_privilege` check in Phase 3 |
| Two repos pushing migrations to one project | perf is the only owner (A2, B1). First push uses `--include-all` |
| A perf action damaging home's functions or `heartbeat` | Functions deployed by name, pre-flight table check, README warnings (A7, B2) |
| Legacy keys disabled or rotated, breaking both apps | Fact 4, B2. Migrate both repos together ("Later") |
| Schema drift between Lovable and our migrations | Offline drift gate (Phase 2) |
| Auth-version mismatch or unexpected export format | Found during the offline rehearsal, not in production |
| Password hashes not portable | Real-password login in Phase 2. Fallback: bulk reset via `reset-user-password` |
| `verify_jwt` rejecting user tokens on the hosted gateway | Smoke test in Phase 3, step 7, with the documented fallback |
| Project pauses (keepalive already failed 6 days once) | Second daily database touch from the backup job (A8) |
| No backups on Free | A8 nightly dump |
| Export file (password hashes) leaking | Kept outside both repos. Archived once, other copies deleted (Phase 5) |
| Lovable re-committing to perf's `main` | H1 disconnects it before any code changes |
| UUIDs regenerated, orphaning history | Data-only restore keeps IDs. Orphan check in the gate |
