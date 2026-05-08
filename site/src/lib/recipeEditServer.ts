import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRecipeRepoRoot } from './loadRecipes';

/**
 * Optional absolute path to the repo that holds section folders (Indian/, …).
 * Use when the auto-detection from `getRecipeRepoRoot()` fails (e.g. custom deploy layout).
 */
export function resolvedRecipeRepoRoot(): string {
  const override = process.env.RECIPE_REPO_ROOT;
  if (override && override.length > 0) {
    return path.resolve(override);
  }
  return getRecipeRepoRoot();
}

export function resolvedSiteRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function recipeEditSecret(): string | undefined {
  const s = process.env.RECIPE_EDIT_TOKEN ?? process.env.FAVORITES_TOKEN;
  return s && s.length > 0 ? s : undefined;
}

/**
 * Dev server: no auth. Production/preview: require RECIPE_EDIT_TOKEN or FAVORITES_TOKEN.
 */
export function assertRecipeEditAuthorized(request: Request): Response | null {
  if (import.meta.env.DEV) return null;
  const secret = recipeEditSecret();
  if (!secret) {
    return new Response(
      'Recipe editing is not configured (set RECIPE_EDIT_TOKEN on the server).',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return null;
}

export function resolveSafeMdPath(repoRoot: string, relativePath: unknown): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(repoRoot + path.sep)) return null;
  if (!resolved.toLowerCase().endsWith('.md')) return null;
  return resolved;
}

export function handleEditLoad(repoRoot: string, relativePath: string | null): Response {
  const resolved = resolveSafeMdPath(repoRoot, relativePath);
  if (!resolved) return text(400, 'invalid path');
  if (!fs.existsSync(resolved)) return text(404, 'file not found');
  const content = fs.readFileSync(resolved, 'utf8');
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}

export function handleEditDelete(repoRoot: string, relativePath: string | undefined): Response {
  const resolved = resolveSafeMdPath(repoRoot, relativePath);
  if (!resolved) return text(400, 'invalid path');
  if (!fs.existsSync(resolved)) return text(404, 'file not found');

  const siteRoot = resolvedSiteRoot();
  const trashDir = path.join(siteRoot, '.trash');
  fs.mkdirSync(trashDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const trashName = `${stamp}__${path.basename(resolved)}`;
  fs.renameSync(resolved, path.join(trashDir, trashName));
  return json(200, { ok: true, trashed: trashName });
}

export function handleEditSave(
  repoRoot: string,
  bodyText: string,
): Response {
  let payload: { relativePath?: string; content?: string; newBaseName?: string };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return text(400, 'invalid JSON');
  }
  if (typeof payload.content !== 'string') return text(400, 'missing content');

  const sourcePath = resolveSafeMdPath(repoRoot, payload.relativePath);
  if (!sourcePath) return text(400, 'invalid path');
  if (!fs.existsSync(sourcePath)) return text(404, 'file not found');

  let targetPath = sourcePath;
  let renamed = false;

  if (payload.newBaseName && payload.newBaseName !== path.basename(sourcePath)) {
    const candidate = payload.newBaseName;
    if (
      candidate.includes('/') ||
      candidate.includes('\\') ||
      candidate.includes('\0') ||
      !candidate.toLowerCase().endsWith('.md') ||
      candidate.startsWith('.')
    ) {
      return text(400, 'invalid newBaseName');
    }
    const sectionDir = path.dirname(sourcePath);
    const proposed = path.resolve(sectionDir, candidate);
    if (path.dirname(proposed) !== sectionDir) {
      return text(400, 'newBaseName escapes section dir');
    }
    if (fs.existsSync(proposed)) {
      return text(409, 'a recipe with that filename already exists');
    }
    fs.renameSync(sourcePath, proposed);
    targetPath = proposed;
    renamed = true;
  }

  fs.writeFileSync(targetPath, payload.content, 'utf8');
  const newRelativePath = path.relative(repoRoot, targetPath);
  return json(200, {
    ok: true,
    renamed,
    relativePath: newRelativePath,
    baseName: path.basename(targetPath),
  });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
