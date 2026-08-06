# Migration: off Lovable → Supabase + Netlify

Status: **planned, not started.** Drafted 2026-08-06.

## The situation

"Getting off Lovable" is two couplings, not one. Lovable hosts the frontend **and** owns the
Supabase project holding all the data.

| | Project ref | Owner |
|---|---|---|
| App's live backend | `rqzkzstltfdtypkvriue` | Lovable Cloud — **not** in our Supabase account |
| Our Supabase account | `ftgcbmthbwwcumvqnuof` ("renegades", org `rbsebggcnppdzytbgded`, us-west-1, PG 15.8, created 2025-01-15) | us |

Verified via `supabase projects list`; both refs return HTTP 401 (alive, key required). So this
is a cross-project data migration, not a redeploy.

What is already in our favour: the 21 files in `supabase/migrations/` fully define the schema —
all four tables, the `app_role` / `football_position` / `metric_type` / `position_type` enums,
`has_role()`, `handle_new_user()`, the `on_auth_user_created` trigger, RLS policies, and the
realtime publication. `ALTER TYPE ... ADD VALUE` is already split from its first use into a
separate migration file, which is what a clean replay needs. All primary keys are
`gen_random_uuid()` — no sequences to reset.

## Blocking decisions

### 1. Postgres access to the Lovable project

- **Path A — we can get a connection string + `postgres` password.** `pg_dump` the `auth`
  schema; password hashes come across; users notice nothing beyond one forced re-login.
- **Path B — service_role key only.** The Admin API does not expose `encrypted_password`. Users
  can be recreated with identical UUIDs, emails and metadata, but **everyone gets a new
  password.** Survivable — accounts are admin-provisioned `firstname.lastname@team.local` and
  `create-user` / `reset-user-password` edge functions already exist — but it needs a comms plan.

Check Lovable Cloud → Project Settings → Database before anything else.

### 2. Target project

Reuse `ftgcbmthbwwcumvqnuof`, or create fresh. **Recommendation: create fresh**, in an EU region.
The existing project predates this app by ~10 months (risk of colliding objects during replay),
and us-west-1 is a latency tax for a Nuremberg club.

---

## Phase 0 — Prerequisites

1. Resolve Path A vs B.
2. Choose and create the target project.
3. Confirm the current Lovable-published URL and whether a custom domain is attached — that
   decides whether cutover is a DNS change or just handing out a new URL.
4. Schedule a maintenance window. Writes must stop during the final sync.

## Phase 1 — Stand up the target project

```sh
supabase link --project-ref <new-ref>
supabase db push                # replays all 21 migrations
supabase functions deploy       # all 7 edge functions
supabase secrets set ALLOWED_ORIGINS="https://<site>.netlify.app,https://*.netlify.app"
```

Then **prove schema parity** — Lovable's UI may have made changes that never landed in a
migration file:

```sh
supabase db dump --db-url "<lovable-conn-string>" --schema public -f /tmp/lovable-schema.sql
supabase db dump --db-url "<new-conn-string>"     --schema public -f /tmp/new-schema.sql
diff /tmp/lovable-schema.sql /tmp/new-schema.sql
```

Any diff is drift that must be reconciled **before** importing data. On Path B there is no
connection string, so this gate degrades to exercising the app manually — a weaker check, and
another argument for pursuing Path A.

## Phase 2 — Data migration (rehearse first)

Run against the new project, verify, truncate, then repeat for real at cutover.

Order is dictated by the FK topology — every table references `auth.users(id) ON DELETE CASCADE:

1. `auth.users` — **UUIDs must be preserved verbatim.** All four public tables key off them;
   regenerating IDs orphans the entire performance history.
2. Disable the trigger before importing:
   `ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;`
   Otherwise `handle_new_user()` fires per insert and fights the `profiles` import.
3. Then in order: `profiles` → `user_roles` → `player_positions` → `performance_entries`.
4. Re-enable the trigger.

**Verification gate:** row counts per table on both sides; a known player's entries still
resolve to the right name; `metric_type` values survived the enum (`30yd_dash`, `3_cone_drill`,
`shuttle_5_10_5`, `jump_gather`, `pushups_1min`, `vertical_jump`); at least one admin, one coach
and one player role intact.

## Phase 3 — Netlify (before cutover)

`netlify.toml` is already in the repo. Create the site from the GitHub repo, then set
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Netlify
env vars pointing at the **new** project.

> `.env` is committed and still hardcodes the Lovable ref — Vite reads it at build time and it
> would win over Netlify env vars. Update it as part of this phase.

Deploy to a preview URL, log in against the migrated data, then fold the real Netlify origin
into `ALLOWED_ORIGINS`.

## Phase 4 — Cutover

Freeze writes → re-run Phase 2 for real → verify counts → point the domain at Netlify →
smoke-test login, dashboard, performance entry, user admin → unfreeze.

The JWT secret differs between projects, so **all existing sessions are invalidated** and every
user re-logs-in once, on both paths.

## Phase 5 — Decommission Lovable

1. Disconnect Lovable's GitHub integration, or it keeps auto-committing to `main` and can
   clobber this setup.
2. Unpublish the Lovable site; remove its custom domain first if one is attached.
3. Keep the Lovable Supabase project **read-only but alive for ~2 weeks** as rollback insurance,
   then take a final dump and delete it.
4. Rotate the old anon / service_role keys — they are in git history.

## Rollback

Valid until step 5.3: revert `.env` to the Lovable ref and repoint DNS. Cheap precisely because
nothing in Phase 2 writes to the old project.

## Risk register

| Risk | Mitigation |
|---|---|
| Password hashes not portable (Path B) | Decide path in Phase 0; prepare user comms + bulk reset via `reset-user-password` |
| Silent schema drift between Lovable's DB and our migrations | Explicit `diff` gate in Phase 1 |
| UUID regeneration orphaning performance history | Preserve UUIDs verbatim; verify with join spot-checks |
| `handle_new_user()` fighting the `profiles` import | Disable/re-enable `on_auth_user_created` around the import |
| Committed `.env` overriding Netlify env vars | Update `.env` in Phase 3 |
| Lovable re-committing to `main` post-cutover | Disconnect the GitHub integration in Phase 5 |
