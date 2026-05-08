import type { APIRoute } from 'astro';
import { handleEditLoad, resolvedRecipeRepoRoot } from '../../../lib/recipeEditServer';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const relativePath = url.searchParams.get('relativePath');
  const repoRoot = resolvedRecipeRepoRoot();
  return handleEditLoad(repoRoot, relativePath);
};
