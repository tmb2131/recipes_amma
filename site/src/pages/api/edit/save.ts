import type { APIRoute } from 'astro';
import { handleEditSave, resolvedRecipeRepoRoot } from '../../../lib/recipeEditServer';

export const prerender = false;

const MAX_BYTES = 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  try {
    const bodyText = await request.text();
    if (bodyText.length > MAX_BYTES) {
      return new Response('body too large', { status: 413 });
    }
    const repoRoot = resolvedRecipeRepoRoot();
    return await handleEditSave(repoRoot, bodyText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Save error: ${msg}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
