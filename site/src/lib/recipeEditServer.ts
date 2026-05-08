import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRecipeRepoRoot } from './loadRecipes';
import {
  getFileContentFromMain,
  getFileShaOnMain,
  getGithubBranchRef,
  isGitHubRecipeSyncEnabled,
  parseGitHubRepo,
  shouldSkipLocalRecipeWrites,
  syncDeleteToGitHubMain,
  syncSaveToGitHubMain,
  toGitHubPath,
  vercelRecipeEditRequiresGitHub,
} from './recipeEditGitHub';

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

/** `site/` directory (for `.trash`), when present next to the recipe repo. */
export function resolvedSiteRoot(): string {
  const repo = resolvedRecipeRepoRoot();
  const atRepo = path.join(repo, 'site');
  if (fs.existsSync(atRepo)) return atRepo;
  // Bundled serverless layout: no sibling `site/` — use repo root for `.trash`.
  return repo;
}

export function resolveSafeMdPath(repoRoot: string, relativePath: unknown): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(repoRoot + path.sep)) return null;
  if (!resolved.toLowerCase().endsWith('.md')) return null;
  return resolved;
}

export async function handleEditLoad(
  repoRoot: string,
  relativePath: string | null,
): Promise<Response> {
  const resolved = resolveSafeMdPath(repoRoot, relativePath);
  if (!resolved) return text(400, 'invalid path');

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const rel = toGitHubPath(repoRoot, resolved);
    try {
      const content = await getFileContentFromMain(gh.owner, gh.repo, rel);
      if (content === null) return text(404, 'file not found');
      return new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    } catch (err) {
      return text(502, `GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!fs.existsSync(resolved)) return text(404, 'file not found');
  const content = fs.readFileSync(resolved, 'utf8');
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}

export async function handleEditDelete(
  repoRoot: string,
  relativePath: string | undefined,
): Promise<Response> {
  const resolved = resolveSafeMdPath(repoRoot, relativePath);
  if (!resolved) return text(400, 'invalid path');

  if (vercelRecipeEditRequiresGitHub()) {
    return text(
      503,
      'On Vercel the recipe tree is read-only. Set GITHUB_TOKEN and GITHUB_REPO to delete via GitHub.',
    );
  }

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const rel = toGitHubPath(repoRoot, resolved);
    if (!(await getFileShaOnMain(gh.owner, gh.repo, rel))) {
      return text(404, 'file not found');
    }
    try {
      await syncDeleteToGitHubMain(repoRoot, resolved);
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return json(200, { ok: true, trashed: '(GitHub only)' });
  }

  if (!fs.existsSync(resolved)) return text(404, 'file not found');

  if (isGitHubRecipeSyncEnabled()) {
    if (!parseGitHubRepo()) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    try {
      await syncDeleteToGitHubMain(repoRoot, resolved);
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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

function relativeRecipePath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

export async function handleEditSave(
  repoRoot: string,
  bodyText: string,
): Promise<Response> {
  let payload: { relativePath?: string; content?: string; newBaseName?: string };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return text(400, 'invalid JSON');
  }
  if (typeof payload.content !== 'string') return text(400, 'missing content');

  if (vercelRecipeEditRequiresGitHub()) {
    return text(
      503,
      'On Vercel the recipe tree is read-only. Set GITHUB_TOKEN and GITHUB_REPO to save edits to GitHub.',
    );
  }

  const sourcePath = resolveSafeMdPath(repoRoot, payload.relativePath);
  if (!sourcePath) return text(400, 'invalid path');

  if (shouldSkipLocalRecipeWrites()) {
    const gh = parseGitHubRepo();
    if (!gh) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    const oldRel = toGitHubPath(repoRoot, sourcePath);
    if (!(await getFileShaOnMain(gh.owner, gh.repo, oldRel))) {
      return text(404, 'file not found on GitHub');
    }
  } else if (!fs.existsSync(sourcePath)) {
    return text(404, 'file not found');
  }

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
    if (shouldSkipLocalRecipeWrites()) {
      const gh = parseGitHubRepo()!;
      const newRel = toGitHubPath(repoRoot, proposed);
      if (await getFileShaOnMain(gh.owner, gh.repo, newRel)) {
        return text(409, 'a recipe with that filename already exists');
      }
    } else if (fs.existsSync(proposed)) {
      return text(409, 'a recipe with that filename already exists');
    }
    targetPath = proposed;
    renamed = true;
  }

  if (shouldSkipLocalRecipeWrites()) {
    try {
      await syncSaveToGitHubMain({
        repoRoot,
        sourceAbsolutePath: sourcePath,
        targetAbsolutePath: targetPath,
        content: payload.content,
        renamed,
      });
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return json(200, {
      ok: true,
      renamed,
      relativePath: relativeRecipePath(repoRoot, targetPath),
      baseName: path.basename(targetPath),
      githubBranch: await getGithubBranchRef(),
    });
  }

  try {
    if (renamed) {
      fs.renameSync(sourcePath, targetPath);
    }
    fs.writeFileSync(targetPath, payload.content, 'utf8');
  } catch (err) {
    return text(
      500,
      `Local save failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (isGitHubRecipeSyncEnabled()) {
    if (!parseGitHubRepo()) {
      return text(
        500,
        'GITHUB_REPO must be owner/repo (e.g. tmb2131/recipes_amma) or a github.com URL when GITHUB_TOKEN is set',
      );
    }
    try {
      await syncSaveToGitHubMain({
        repoRoot,
        sourceAbsolutePath: sourcePath,
        targetAbsolutePath: targetPath,
        content: payload.content,
        renamed,
      });
    } catch (err) {
      return text(502, `GitHub sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const githubBranch = isGitHubRecipeSyncEnabled() ? await getGithubBranchRef() : undefined;
  return json(200, {
    ok: true,
    renamed,
    relativePath: relativeRecipePath(repoRoot, targetPath),
    baseName: path.basename(targetPath),
    ...(githubBranch !== undefined ? { githubBranch } : {}),
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
