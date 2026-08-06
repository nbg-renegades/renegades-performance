// Origins allowed to call the edge functions, set as a comma-separated list in the
// ALLOWED_ORIGINS secret (e.g. "https://renegades.netlify.app,https://*.netlify.app").
// An entry starting with "*." matches any https subdomain, which covers Netlify
// deploy previews. Falls back to the local dev servers when the secret is unset.
const DEV_ORIGINS = ['http://localhost:8080', 'http://localhost:4173'];

const allowList = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const origins = allowList.length > 0 ? allowList : DEV_ORIGINS;

function isAllowed(origin: string): boolean {
  return origins.some((allowed) => {
    if (allowed === origin) return true;

    // "https://*.netlify.app" (or bare "*.netlify.app") matches any subdomain of
    // netlify.app, but never the apex and never a lookalike like evil-netlify.app.
    const wildcard = allowed.match(/^(https?:\/\/)?\*\.(.+)$/);
    if (!wildcard) return false;

    const scheme = wildcard[1] ?? 'https://';
    const domain = wildcard[2];
    return origin.startsWith(scheme) && origin.slice(scheme.length).endsWith(`.${domain}`);
  });
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  // Omitting the header entirely is what makes the browser block a disallowed origin.
  if (origin && isAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}
