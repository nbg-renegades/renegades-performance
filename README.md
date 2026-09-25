# Renegades Performance

Flag football performance tracking: players log combine-style metrics, coaches compare
them across positions and units.

## How can I edit this code?

Requires **Node 24+** (see `.nvmrc`) and npm.

```sh
git clone https://github.com/nbg-renegades/renegades-performance.git
cd renegades-performance

pnpm install  # install dependencies
pnpm dev      # dev server on http://localhost:8080
```

Other scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.

`pnpm test` runs the Playwright suite in [`tests/`](./tests). Every Supabase call is
intercepted and the session is seeded into localStorage, so it needs no backend, no
credentials and no network — but it does need `.env` present, since it reads the project
ref from there to match the client's auth storage key. `pnpm test:ui` opens the inspector.

The package manager is pnpm, pinned by the `packageManager` field in `package.json`; run
`corepack enable` once and the right version is used automatically. `pnpm-workspace.yaml`
sets `minimumReleaseAge` to 7200 minutes (5 days), so a newly published version is not
installed until it has been out long enough for a compromised release to be noticed.

This project was originally scaffolded with Lovable. It is no longer wired to it — the
`lovable-tagger` plugin has been removed and the app deploys via Netlify, so editing
happens locally or through pull requests.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

The frontend is a static SPA hosted on **Netlify**; the backend (Postgres, Auth, Edge
Functions, Realtime) runs on **Supabase**.

### Frontend (Netlify)

Build settings come from [`netlify.toml`](./netlify.toml) — `pnpm build`, publish
`dist`, with a catch-all rewrite to `index.html` so `BrowserRouter` deep links work.

1. In Netlify, *Add new site → Import an existing project* and pick this repo.
2. Accept the detected settings (they are read from `netlify.toml`).
3. Deploy. Pushes to `main` then deploy automatically.

Set `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
under *Site configuration → Environment variables*. They are publishable by design (the
anon key is safe in a browser bundle; RLS is what protects the data), but they are not
committed: `.env` is git-ignored so a local `pnpm dev` can never silently write to
production. Copy [`.env.example`](./.env.example) to `.env` to develop.

Vite does not let `.env` override variables that are already set in the environment, so
Netlify's site variables always win in CI builds.

### Backend (Supabase)

> **This repo shares its Supabase project with the club homepage.** Read
> [Shared Supabase project](#shared-supabase-project) before running anything below.

```sh
supabase link --project-ref ekmdcqcjvodsnaqpsgun
supabase db push                              # apply migrations

# Deploy by name. A bare `supabase functions deploy` is fine, but never
# `supabase functions delete` without naming a function - see below.
supabase functions deploy create-user delete-user get-dashboard-stats \
  get-performance-averages get-performance-benchmarks get-player-neighborhood \
  reset-user-password
```

Edge functions only accept browser requests from origins listed in the
`ALLOWED_ORIGINS` secret (comma-separated; an entry like `https://*.netlify.app`
matches deploy previews). **This must be set after the site exists, or production
requests will fail CORS** — the unset fallback allows localhost only:

```sh
supabase secrets set ALLOWED_ORIGINS="https://your-site.netlify.app,https://*.netlify.app"
```

### Custom domain

Add it in Netlify under *Domain management*, then append it to `ALLOWED_ORIGINS`.

## Shared Supabase project

Supabase project `ekmdcqcjvodsnaqpsgun` ("renegades-eu") backs two applications:

| | This app | Club homepage ([`phhbr/renegades`](https://github.com/phhbr/renegades)) |
|---|---|---|
| Tables | `profiles`, `user_roles`, `player_positions`, `performance_entries` | `heartbeat` |
| Edge functions | the seven listed above | `send-contact-email`, `send-tryout-email`, `send-membership-application` |
| Secrets | `ALLOWED_ORIGINS` | `RESEND_API_KEY`, `NOTIFICATION_EMAILS`, `RECAPTCHA_SECRET_KEY` |
| Auth users | admin-provisioned `firstname.lastname@team.local` | none; the forms are anonymous |

**This repo owns the migration history.** `supabase/migrations/` is the single source of
truth for the whole project, including the homepage's
[`20260915093600_heartbeat.sql`](./supabase/migrations/20260915093600_heartbeat.sql),
which is kept here byte for byte. The homepage runs no migrations. Any schema change for
either app goes through a pull request here.

Three things will break the homepage if you get them wrong:

- **Never drop `public.heartbeat`.** A daily scheduled read of it is what keeps the Free
  project from auto-pausing, which would take down both apps.
- **Never run a bare `supabase functions delete`**, and never let a cleanup script treat
  the three `send-*` functions as strays. Deploy and delete functions by name.
- **Never rotate or disable the API keys alone.** Both apps authenticate with the
  project's legacy `eyJ…` keys. Disabling them in *Settings → API Keys* breaks the
  homepage's forms and keepalive as well as this app; both repos have to move to the new
  `sb_publishable_`/`sb_secret_` keys in the same change.

Both apps also share the Free tier's quotas, so they pause and run out together.

### Backups

[`.github/workflows/db-backup.yml`](./.github/workflows/db-backup.yml) dumps roles,
schema and data every night and keeps the result as a 30-day build artifact — the Free
plan takes no backups of its own. It needs the `SUPABASE_DB_URL` repository secret, which
must be the **session pooler** URI, because the direct database host is IPv6-only and
GitHub runners have no IPv6. The dump covers the homepage's data too, and its nightly
connection acts as a second, independent keepalive.
