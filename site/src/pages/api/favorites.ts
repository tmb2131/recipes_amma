/**
 * GET /api/favorites
 *
 * Public, unauthenticated. Returns the canonical list of favorite recipe
 * slugs from the favorites store.
 *
 * The static pages render an initial seed (from the title-prefix `family`
 * flag) at build time; on every page load the client overlays the live
 * answer from this endpoint, so hearts stay accurate without rebuilds.
 */
import type { APIRoute } from 'astro';
import { listFavorites } from '../../lib/favoritesStore';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const slugs = await listFavorites();
    return new Response(JSON.stringify({ slugs }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Short cache so the CDN absorbs the read load but new toggles
        // surface within a few seconds for the next visitor.
        'cache-control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
};
