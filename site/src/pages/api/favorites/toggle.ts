/**
 * POST /api/favorites/toggle
 *
 * Body: `{ "slug": "<recipe-slug>" }`
 * Auth: `Authorization: Bearer <FAVORITES_TOKEN>` — the token is a single
 *       shared secret set as an env var on the Vercel project. Anyone with
 *       the token can edit; everyone else can only read.
 *
 * Returns `{ "slug": string, "favorite": boolean }` on success.
 *
 * In local dev `FAVORITES_TOKEN` defaults to `dev` so editing works out of
 * the box; override via the env if you want to test the auth flow.
 */
import type { APIRoute } from 'astro';
import { toggleFavorite } from '../../../lib/favoritesStore';

export const prerender = false;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/;

function expectedToken(): string {
  return process.env.FAVORITES_TOKEN ?? (import.meta.env.DEV ? 'dev' : '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const POST: APIRoute = async ({ request }) => {
  const expected = expectedToken();
  if (!expected) {
    return json(503, { error: 'FAVORITES_TOKEN is not configured on the server.' });
  }

  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const provided = match ? match[1].trim() : '';
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json(401, { error: 'Invalid or missing token.' });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Body must be valid JSON.' });
  }
  const slug =
    payload && typeof payload === 'object' && 'slug' in (payload as Record<string, unknown>)
      ? String((payload as Record<string, unknown>).slug ?? '')
      : '';
  if (!slug || !SLUG_RE.test(slug)) {
    return json(400, { error: 'Invalid slug.' });
  }

  try {
    const favorite = await toggleFavorite(slug);
    return json(200, { slug, favorite });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
