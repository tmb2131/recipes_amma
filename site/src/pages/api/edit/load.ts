import type { APIRoute } from 'astro';
import { handleEditLoad, resolvedRecipeRepoRoot } from '../../../lib/recipeEditServer';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const relativePath = url.searchParams.get('relativePath');
  const repoRoot = resolvedRecipeRepoRoot();
  return await handleEditLoad(repoRoot, relativePath);
};
