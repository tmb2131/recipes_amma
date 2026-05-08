import type { APIRoute } from 'astro';
import {
  assertRecipeEditAuthorized,
  handleEditLoad,
  resolvedRecipeRepoRoot,
} from '../../../lib/recipeEditServer';

export const prerender = false;

export const GET: APIRoute = ({ request, url }) => {
  const auth = assertRecipeEditAuthorized(request);
  if (auth) return auth;
  const relativePath = url.searchParams.get('relativePath');
  const repoRoot = resolvedRecipeRepoRoot();
  return handleEditLoad(repoRoot, relativePath);
};
