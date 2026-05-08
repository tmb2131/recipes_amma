import type { APIRoute } from 'astro';
import { handleEditDelete, resolvedRecipeRepoRoot } from '../../../lib/recipeEditServer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  const relativePath =
    payload && typeof payload === 'object' && 'relativePath' in (payload as Record<string, unknown>)
      ? String((payload as Record<string, unknown>).relativePath ?? '')
      : '';
  const repoRoot = resolvedRecipeRepoRoot();
  return handleEditDelete(repoRoot, relativePath || undefined);
};
