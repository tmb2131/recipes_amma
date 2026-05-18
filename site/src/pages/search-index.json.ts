import type { APIRoute } from 'astro';
import { getRecipes } from '../lib/loadRecipes';

export const prerender = true;

const normalizeHref = (url: string) => {
  const clean = url.startsWith('/') ? url : `/${url}`;
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
};

const cleanBodyText = (body: string) =>
  body
    .replace(/[#*`>_\[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const GET: APIRoute = () => {
  const entries = getRecipes().map((recipe) => {
    const cleaned = cleanBodyText(recipe.body);
    return {
      href: normalizeHref(recipe.href),
      title: recipe.title,
      section: recipe.section,
      source: recipe.source ?? '',
      family: recipe.family,
      ingredients: recipe.ingredients ?? [],
      excerpt: cleaned.slice(0, 500),
      preview: cleaned.slice(0, 130),
    };
  });

  return new Response(JSON.stringify(entries), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
