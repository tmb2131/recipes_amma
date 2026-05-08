/**
 * POST /api/favorites/toggle
 *
 * Body: `{ "slug": "<recipe-slug>" }`
 *
 * Returns `{ "slug": string, "favorite": boolean }` on success.
 */
import type { APIRoute } from 'astro';
import {
  FavoritesStorageUnavailableError,
  toggleFavorite,
} from '../../../lib/favoritesStore';

export const prerender = false;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/;

export const POST: APIRoute = async ({ request }) => {
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
    if (err instanceof FavoritesStorageUnavailableError) {
      return json(503, { error: err.message });
    }
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
