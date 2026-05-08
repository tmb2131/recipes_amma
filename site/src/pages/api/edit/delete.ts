import type { APIRoute } from 'astro';
import {
  assertRecipeEditAuthorized,
  handleEditDelete,
  resolvedRecipeRepoRoot,
} from '../../../lib/recipeEditServer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = assertRecipeEditAuthorized(request);
  if (auth) return auth;
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
