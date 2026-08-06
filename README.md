# Renegades Performance

Flag football performance tracking: players log combine-style metrics, coaches compare
them across positions and units.

## How can I edit this code?

Requires **Node 24+** (see `.nvmrc`) and npm.

```sh
git clone https://github.com/nbg-renegades/renegades-performance.git
cd renegades-performance

npm ci        # install dependencies
npm run dev   # dev server on http://localhost:8080
```

Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`.

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

Build settings come from [`netlify.toml`](./netlify.toml) — `npm run build`, publish
`dist`, with a catch-all rewrite to `index.html` so `BrowserRouter` deep links work.

1. In Netlify, *Add new site → Import an existing project* and pick this repo.
2. Accept the detected settings (they are read from `netlify.toml`).
3. Deploy. Pushes to `main` then deploy automatically.

The `VITE_SUPABASE_*` values are committed in `.env` and are publishable by design, so
no build environment variables are strictly required. To override them per environment,
set them under *Site configuration → Environment variables* instead.

### Backend (Supabase)

```sh
supabase link --project-ref <project-ref>
supabase db push                              # apply migrations
supabase functions deploy                     # deploy all edge functions
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
