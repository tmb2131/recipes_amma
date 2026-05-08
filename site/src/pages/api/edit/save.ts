import type { APIRoute } from 'astro';
import { handleEditSave, resolvedRecipeRepoRoot } from '../../../lib/recipeEditServer';

export const prerender = false;

const MAX_BYTES = 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const bodyText = await request.text();
  if (bodyText.length > MAX_BYTES) {
    return new Response('body too large', { status: 413 });
  }
  const repoRoot = resolvedRecipeRepoRoot();
  return await handleEditSave(repoRoot, bodyText);
};
